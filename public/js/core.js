'use strict';
/* core.js — o modelo do Veredicto (sem DOM, testável em Node).
 *
 * Hipóteses com métrica, sessões de teste (1 sessão = 1 linha = 1 veredicto) e a decisão
 * perseverar / ajustar / matar por incremento (ou por hipótese solta). Regras:
 *  - a métrica é obrigatória ao criar/editar uma hipótese (hipóteses importadas sem métrica ficam «a completar»);
 *  - o estado só avança: aberta → sustentada | refutada | insuficiente; insuficiente → sustentada | refutada;
 *  - `insuficiente` é veredicto real: a hipótese continua «por testar»;
 *  - a app sugere, o humano decide — nada muda de estado sozinho; a decisão exige um porquê.
 * Todas as funções que mudam o documento devolvem { ok, erro?, doc? } e nunca mutam o documento recebido.
 */
(function (raiz) {
  var ESTADOS = ['aberta', 'sustentada', 'refutada', 'insuficiente'];
  var VEREDICTOS = ['sustentada', 'refutada', 'insuficiente'];
  var TIPOS_SESSAO = ['levantamento', 'validacao'];
  var ACCOES = ['ajuste', 'tema', 'aprender'];
  var DECISOES = ['perseverar', 'ajustar', 'matar'];
  var SEGUINTES = { aberta: ['sustentada', 'refutada', 'insuficiente'], insuficiente: ['sustentada', 'refutada'], sustentada: [], refutada: [] };

  var LIM = { texto: 500, curto: 120, hipoteses: 500, sessoes: 200, decisoes: 500, incrementos: 200 };
  var RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
  var RE_ID = /^[a-z]{3}_[a-z0-9]{4,24}$/;
  var RE_ID_EXT = /^[A-Za-z0-9_-]{1,64}$/;   // ids de incrementos que vêm de fora (boards do Taskboards)

  function txt(v, max) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max || LIM.texto); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function novoId(prefixo) { return prefixo + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function hoje() { return new Date().toISOString().slice(0, 10); }
  function erro(m) { return { ok: false, erro: m }; }

  function vazio() { return { app: 'veredicto', versao: 1, actualizado: 0, incrementos: [], hipoteses: [], decisoes: [] }; }

  /* ---- limpeza (nunca confiar no que vem de fora) ---------------------- */

  function limparMetrica(m) {
    if (!m || typeof m !== 'object') return null;
    var r = { indicador: txt(m.indicador, LIM.curto * 2), alvo: txt(m.alvo, LIM.curto), como: txt(m.como) };
    return r.indicador || r.alvo || r.como ? r : null;
  }

  function limparSessao(s) {
    if (!s || typeof s !== 'object') return null;
    var v = VEREDICTOS.indexOf(s.veredicto) >= 0 ? s.veredicto : null;
    if (!v) return null;
    var a = s.accao && typeof s.accao === 'object' ? s.accao : {};
    return {
      data: RE_DATA.test(String(s.data)) ? String(s.data) : hoje(),
      tipo: TIPOS_SESSAO.indexOf(s.tipo) >= 0 ? s.tipo : 'validacao',
      participantes: txt(s.participantes, LIM.curto),
      sinal: txt(s.sinal),
      medido: txt(s.medido, LIM.curto) || null,
      veredicto: v,
      accao: { tipo: ACCOES.indexOf(a.tipo) >= 0 ? a.tipo : 'aprender', destino: txt(a.destino, LIM.curto) || null }
    };
  }

  /* opcoes.incrementos (modo monco): a lista de incrementos vem de fora, só de leitura — os ids ficam como vêm
     (se forem seguros) e uma ligação a um incremento que deixou de existir é preservada («ligação perdida»). */
  function limpar(entrada, opcoes) {
    var d = vazio();
    var ext = opcoes && Array.isArray(opcoes.incrementos) ? opcoes.incrementos : null;
    if (!entrada || typeof entrada !== 'object') entrada = {};
    d.actualizado = Number(entrada.actualizado) || 0;
    var vistos = {};
    function idUnico(id, prefixo) {
      var i = RE_ID.test(String(id)) && String(id).indexOf(prefixo + '_') === 0 ? String(id) : novoId(prefixo);
      while (vistos[i]) i = novoId(prefixo);
      vistos[i] = true;
      return i;
    }
    if (ext) {
      ext.slice(0, LIM.incrementos).forEach(function (inc) {
        var id = String(inc && inc.id), nome = txt(inc && inc.nome, LIM.curto);
        if (nome && RE_ID_EXT.test(id) && !vistos[id]) { vistos[id] = true; d.incrementos.push({ id: id, nome: nome }); }
      });
    } else {
      (Array.isArray(entrada.incrementos) ? entrada.incrementos : []).slice(0, LIM.incrementos).forEach(function (inc) {
        var nome = txt(inc && inc.nome, LIM.curto);
        if (nome) d.incrementos.push({ id: idUnico(inc.id, 'inc'), nome: nome });
      });
    }
    var incs = {};
    d.incrementos.forEach(function (i) { incs[i.id] = true; });
    function refInc(id) { return incs[id] ? id : (ext && id != null && RE_ID_EXT.test(String(id)) ? String(id) : null); }
    (Array.isArray(entrada.hipoteses) ? entrada.hipoteses : []).slice(0, LIM.hipoteses).forEach(function (h) {
      if (!h || typeof h !== 'object') return;
      var aposta = txt(h.aposta || h.texto);
      if (!aposta) return;
      d.hipoteses.push({
        id: idUnico(h.id, 'hip'),
        incremento: refInc(h.incremento),
        feature: txt(h.feature, LIM.curto) || null,
        origem: txt(h.origem, LIM.curto) || null,
        problema: txt(h.problema),
        utilizador: txt(h.utilizador, LIM.curto),
        aposta: aposta,
        metrica: limparMetrica(h.metrica),
        critica: h.critica !== false,
        estado: ESTADOS.indexOf(h.estado) >= 0 ? h.estado : 'aberta',
        sessoes: (Array.isArray(h.sessoes) ? h.sessoes : []).slice(0, LIM.sessoes).map(limparSessao).filter(Boolean)
      });
    });
    var hips = {};
    d.hipoteses.forEach(function (h) { hips[h.id] = true; });
    (Array.isArray(entrada.decisoes) ? entrada.decisoes : []).slice(0, LIM.decisoes).forEach(function (x) {
      if (!x || DECISOES.indexOf(x.decisao) < 0) return;
      var inc = refInc(x.incremento);
      var hip = !inc && hips[x.hipotese] ? x.hipotese : null;
      var porque = txt(x.porque);
      if ((!inc && !hip) || !porque) return;
      d.decisoes.push({
        id: idUnico(x.id, 'dec'), incremento: inc, hipotese: hip, decisao: x.decisao, porque: porque,
        hipoteses: (Array.isArray(x.hipoteses) ? x.hipoteses : []).filter(function (id) { return hips[id]; }),
        data: RE_DATA.test(String(x.data)) ? String(x.data) : hoje(), quem: txt(x.quem, LIM.curto) || null
      });
    });
    return d;
  }

  /* ---- consultas -------------------------------------------------------- */

  function ligacaoPerdida(doc, h) { return !!h.incremento && !doc.incrementos.some(function (i) { return i.id === h.incremento; }); }
  function porTestar(h) { return h.estado === 'aberta' || h.estado === 'insuficiente'; }
  function metricaCompleta(m) { return !!(m && m.indicador && m.alvo); }
  function seguintes(estado) { return (SEGUINTES[estado] || []).slice(); }
  function hipotese(doc, id) { return doc.hipoteses.filter(function (h) { return h.id === id; })[0] || null; }
  function doIncremento(doc, incId) { return doc.hipoteses.filter(function (h) { return h.incremento === incId; }); }
  function contagem(hs) {
    var c = { aberta: 0, sustentada: 0, refutada: 0, insuficiente: 0, total: hs.length };
    hs.forEach(function (h) { c[h.estado]++; });
    return c;
  }

  /* Sugestão para um conjunto de hipóteses (as de um incremento, ou uma solta).
     Pesam as críticas; se nenhuma for crítica, pesam todas. */
  function sugerir(hs) {
    if (!hs.length) return { sugestao: 'ainda-nao', motivo: 'sem hipóteses para decidir' };
    var pesam = hs.filter(function (h) { return h.critica; });
    if (!pesam.length) pesam = hs;
    var pendentes = pesam.filter(porTestar).length;
    if (pendentes) return { sugestao: 'ainda-nao', motivo: pendentes + (pendentes === 1 ? ' hipótese crítica ainda por testar' : ' hipóteses críticas ainda por testar') };
    var refutadas = pesam.filter(function (h) { return h.estado === 'refutada'; }).length;
    if (!refutadas) return { sugestao: 'perseverar', motivo: 'todas as hipóteses críticas sustentadas' };
    if (refutadas === pesam.length) return { sugestao: 'matar', motivo: 'todas as hipóteses críticas refutadas' };
    return { sugestao: 'ajustar', motivo: refutadas + ' de ' + pesam.length + ' hipóteses críticas refutadas' };
  }

  /* ---- mudanças ---------------------------------------------------------- */

  function carimbar(d) { d.actualizado = Date.now(); return { ok: true, doc: d }; }

  function garantirIncremento(doc, nome, criar) {
    var n = txt(nome, LIM.curto);
    if (!n) return { ok: true, doc: copia(doc), id: null };
    var d = copia(doc);
    var e = d.incrementos.filter(function (i) { return i.nome.toLowerCase() === n.toLowerCase(); })[0];
    if (e) return { ok: true, doc: d, id: e.id };
    if (criar === false) return erro('não há o incremento «' + n + '» — os incrementos criam-se no Taskboards');
    if (d.incrementos.length >= LIM.incrementos) return erro('limite de incrementos atingido');
    var id = novoId('inc');
    d.incrementos.push({ id: id, nome: n });
    return { ok: true, doc: d, id: id };
  }

  function validarCampos(c) {
    if (!txt(c.aposta)) return 'escreve a aposta (se fizermos X, então Y)';
    if (!metricaCompleta(limparMetrica(c.metrica))) return 'a métrica é obrigatória: indica o que se mede e o alvo';
    return null;
  }

  /* opcoes.criarIncremento === false (modo monco): um nome de incremento desconhecido é recusado. */
  function guardarHipotese(doc, campos, opcoes) {
    var problema = validarCampos(campos);
    if (problema) return erro(problema);
    var r = garantirIncremento(doc, campos.incrementoNome, !(opcoes && opcoes.criarIncremento === false));
    if (!r.ok) return r;
    var d = r.doc;
    var dados = {
      incremento: r.id, problema: txt(campos.problema), utilizador: txt(campos.utilizador, LIM.curto),
      aposta: txt(campos.aposta), metrica: limparMetrica(campos.metrica), critica: campos.critica !== false
    };
    if (campos.id) {
      var h = hipotese(d, campos.id);
      if (!h) return erro('hipótese não encontrada');
      Object.keys(dados).forEach(function (k) { h[k] = dados[k]; });
      return carimbar(d);
    }
    if (d.hipoteses.length >= LIM.hipoteses) return erro('limite de hipóteses atingido');
    dados.id = novoId('hip'); dados.feature = null; dados.origem = null; dados.estado = 'aberta'; dados.sessoes = [];
    d.hipoteses.push(dados);
    var res = carimbar(d); res.id = dados.id;
    return res;
  }

  function apagarHipotese(doc, id) {
    var d = copia(doc);
    var antes = d.hipoteses.length;
    d.hipoteses = d.hipoteses.filter(function (h) { return h.id !== id; });
    if (d.hipoteses.length === antes) return erro('hipótese não encontrada');
    d.decisoes.forEach(function (x) { x.hipoteses = x.hipoteses.filter(function (i) { return i !== id; }); });
    d.decisoes = d.decisoes.filter(function (x) { return x.hipotese !== id; });
    return carimbar(d);
  }

  function mudarEstado(doc, id, novo) {
    var d = copia(doc);
    var h = hipotese(d, id);
    if (!h) return erro('hipótese não encontrada');
    if (seguintes(h.estado).indexOf(novo) < 0) {
      var s = seguintes(h.estado);
      return erro('não se passa de «' + h.estado + '» para «' + novo + '»' + (s.length ? ' — a partir daqui: ' + s.join(', ') : ' — o estado já está fechado; um re-teste é uma sessão nova'));
    }
    h.estado = novo;
    return carimbar(d);
  }

  /* Regista uma sessão. Se `opcoes.actualizarEstado`, o estado acompanha o veredicto quando a passagem é permitida
     (decisão explícita de quem regista — a UI pergunta). */
  function registarSessao(doc, idHip, campos, opcoes) {
    var d = copia(doc);
    var h = hipotese(d, idHip);
    if (!h) return erro('escolhe a hipótese');
    if (!txt(campos.sinal)) return erro('escreve o sinal observado');
    if (VEREDICTOS.indexOf(campos.veredicto) < 0) return erro('escolhe o veredicto');
    if (ACCOES.indexOf(campos.accao && campos.accao.tipo) < 0) return erro('escolhe a acção');
    if (!RE_DATA.test(String(campos.data || ''))) return erro('data inválida (AAAA-MM-DD)');
    if (h.sessoes.length >= LIM.sessoes) return erro('limite de sessões desta hipótese atingido');
    h.sessoes.push(limparSessao(campos));
    if (opcoes && opcoes.actualizarEstado && seguintes(h.estado).indexOf(campos.veredicto) >= 0) h.estado = campos.veredicto;
    return carimbar(d);
  }

  /* alvo: { incremento: id } ou { hipotese: id } */
  function decidir(doc, alvo, campos) {
    if (DECISOES.indexOf(campos.decisao) < 0) return erro('escolhe perseverar, ajustar ou matar');
    var porque = txt(campos.porque);
    if (!porque) return erro('a decisão precisa de um porquê');
    var d = copia(doc);
    var hs;
    if (alvo.incremento) {
      if (!d.incrementos.some(function (i) { return i.id === alvo.incremento; })) return erro('incremento não encontrado');
      hs = doIncremento(d, alvo.incremento);
    } else {
      var h = hipotese(d, alvo.hipotese);
      if (!h) return erro('hipótese não encontrada');
      if (h.incremento) return erro('esta hipótese pertence a um incremento — decide no incremento');
      hs = [h];
    }
    if (d.decisoes.length >= LIM.decisoes) return erro('limite de decisões atingido');
    d.decisoes.push({
      id: novoId('dec'), incremento: alvo.incremento || null, hipotese: alvo.incremento ? null : alvo.hipotese,
      decisao: campos.decisao, porque: porque, hipoteses: hs.map(function (x) { return x.id; }),
      data: RE_DATA.test(String(campos.data || '')) ? campos.data : hoje(), quem: txt(campos.quem, LIM.curto) || null
    });
    return carimbar(d);
  }

  /* ---- importar / exportar ---------------------------------------------- */

  /* O ledger YAML do Veredicto v0 (spine §2.5) — só o subconjunto que o v0 escreve. */
  function lerYamlV0(texto) {
    var linhas = String(texto).split(/\r?\n/);
    var hs = [], h = null, s = null, emSessoes = false;
    function valor(v) {
      v = v.replace(/\s+#.*$/, '').trim();
      if (/^".*"$/.test(v)) return v.slice(1, -1).replace(/\\"/g, '"');
      return v;
    }
    function mapa(v) {
      var m = {};
      v = v.trim().replace(/^\{|\}$/g, '');
      v.split(',').forEach(function (par) {
        var i = par.indexOf(':');
        if (i > 0) m[par.slice(0, i).trim()] = valor(par.slice(i + 1));
      });
      return m;
    }
    linhas.forEach(function (l) {
      var m;
      if ((m = l.match(/^\s*-\s+id:\s*(.+)$/))) { h = { id: valor(m[1]), sessoes: [] }; hs.push(h); s = null; emSessoes = false; return; }
      if (!h) return;
      if ((m = l.match(/^\s*-\s+data:\s*(.+)$/)) && emSessoes) { s = { data: valor(m[1]) }; h.sessoes.push(s); return; }
      if ((m = l.match(/^\s*sessoes:\s*(.*)$/))) { emSessoes = true; s = null; return; }
      if ((m = l.match(/^\s*(\w+):\s*(.*)$/))) {
        var k = m[1], v = m[2];
        var alvo = s && emSessoes && ['tipo', 'participantes', 'sinal', 'veredicto', 'accao'].indexOf(k) >= 0 ? s : h;
        alvo[k] = k === 'accao' ? mapa(v) : valor(v);
      }
    });
    return { hipoteses: hs.map(function (x) {
      return { origem: [x.id, x.origem].filter(Boolean).join(' · '), aposta: x.texto, estado: x.estado, critica: true, metrica: null, sessoes: x.sessoes };
    }) };
  }

  function importar(texto) {
    var t = String(texto || '').trim();
    if (!t) return erro('ficheiro vazio');
    var bruto;
    if (t.charAt(0) === '{') {
      try { bruto = JSON.parse(t); } catch (e) { return erro('JSON inválido'); }
      if (bruto.app !== 'veredicto') return erro('este JSON não é um ficheiro do Veredicto');
    } else if (/^\s*hipoteses:/m.test(t)) {
      bruto = lerYamlV0(t);
    } else {
      return erro('formato desconhecido — aceita o JSON do Veredicto ou o validacoes.yaml do v0');
    }
    var d = limpar(bruto);
    if (!d.hipoteses.length && !d.decisoes.length) return erro('nenhuma hipótese válida no ficheiro');
    return { ok: true, doc: d };
  }

  function exportarJSON(doc) { return JSON.stringify(limpar(doc), null, 2) + '\n'; }

  function celula(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|'); }

  function exportarMarkdown(doc, titulo) {
    var L = ['# Veredicto' + (titulo ? ' — ' + titulo : ''), ''];
    function blocoHipotese(h) {
      L.push('### ' + h.aposta + ' — *' + h.estado + '*' + (h.critica ? ' · crítica' : ''));
      if (h.problema) L.push('- **Problema:** ' + h.problema);
      if (h.utilizador) L.push('- **Utilizador:** ' + h.utilizador);
      L.push('- **Métrica:** ' + (metricaCompleta(h.metrica) ? h.metrica.indicador + ' · alvo ' + h.metrica.alvo + (h.metrica.como ? ' · ' + h.metrica.como : '') : '*a completar*'));
      if (h.sessoes.length) {
        L.push('', '| data | tipo | sinal | medido | veredicto | acção |', '|---|---|---|---|---|---|');
        h.sessoes.forEach(function (s) {
          L.push('| ' + [s.data, s.tipo, celula(s.sinal), celula(s.medido || ''), s.veredicto, s.accao.tipo + (s.accao.destino ? ' → ' + celula(s.accao.destino) : '')].join(' | ') + ' |');
        });
      } else {
        L.push('- *Sem sessões.*');
      }
      L.push('');
    }
    function blocoDecisoes(lista) {
      lista.forEach(function (x) { L.push('> **' + x.decisao.toUpperCase() + '** (' + x.data + ') — ' + x.porque); });
      if (lista.length) L.push('');
    }
    doc.incrementos.forEach(function (inc) {
      var hs = doIncremento(doc, inc.id);
      var c = contagem(hs);
      L.push('## ' + inc.nome, '', 'Hipóteses: ' + c.total + ' · sustentadas ' + c.sustentada + ' · refutadas ' + c.refutada + ' · insuficientes ' + c.insuficiente + ' · abertas ' + c.aberta, '');
      blocoDecisoes(doc.decisoes.filter(function (x) { return x.incremento === inc.id; }));
      hs.forEach(blocoHipotese);
    });
    var soltas = doc.hipoteses.filter(function (h) { return !h.incremento; });
    if (soltas.length) {
      L.push('## Hipóteses sem incremento', '');
      soltas.forEach(function (h) {
        blocoHipotese(h);
        L.pop();
        L.push('');
        blocoDecisoes(doc.decisoes.filter(function (x) { return x.hipotese === h.id; }));
      });
    }
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  var api = {
    ESTADOS: ESTADOS, VEREDICTOS: VEREDICTOS, TIPOS_SESSAO: TIPOS_SESSAO, ACCOES: ACCOES, DECISOES: DECISOES,
    vazio: vazio, limpar: limpar, ligacaoPerdida: ligacaoPerdida, porTestar: porTestar, metricaCompleta: metricaCompleta, seguintes: seguintes,
    hipotese: hipotese, doIncremento: doIncremento, contagem: contagem, sugerir: sugerir,
    guardarHipotese: guardarHipotese, apagarHipotese: apagarHipotese, mudarEstado: mudarEstado,
    registarSessao: registarSessao, decidir: decidir,
    importar: importar, lerYamlV0: lerYamlV0, exportarJSON: exportarJSON, exportarMarkdown: exportarMarkdown, hoje: hoje
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Veredicto = api;
})(this);
