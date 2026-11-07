'use strict';
/* app.js — a interface do Veredicto. Todo o texto do utilizador entra por textContent (el()). */
(function () {
  var V = window.Veredicto;
  var store = window.VeredictoStore.local(V);
  var doc = store.ler();
  var ui = { vista: 'hipoteses', filtro: 'todas', incremento: '*', editar: null, sessaoDe: null };

  var ROT_ESTADO = { aberta: 'aberta', sustentada: 'sustentada', refutada: 'refutada', insuficiente: 'insuficiente · re-testar' };
  var ROT_TIPO = { validacao: 'validação', levantamento: 'levantamento' };
  var ROT_ACCAO = { ajuste: 'ajuste → tarefa', tema: 'tema → roadmap', aprender: 'aprender → decisões' };
  var ROT_DEC = { perseverar: 'perseverar', ajustar: 'ajustar', matar: 'matar', 'ainda-nao': 'ainda não — testar primeiro' };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (filhos || []).forEach(function (f) { if (f != null) n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return n;
  }
  function tag(classe, texto) { return el('span', { class: 'tag tag--' + classe, text: texto }); }

  var temporizador;
  function avisar(m) {
    var t = $('toast');
    t.textContent = m; t.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function aplicar(r, msg) {
    if (!r.ok) { avisar(r.erro); return false; }
    doc = r.doc;
    if (!store.escrever(doc)) avisar('não foi possível guardar neste browser — exporta para não perder');
    else if (msg) avisar(msg);
    render();
    return true;
  }

  function nomeIncremento(id) {
    var i = doc.incrementos.filter(function (x) { return x.id === id; })[0];
    return i ? i.nome : '';
  }

  /* ── vista hipóteses ─────────────────────────────────────────────────── */

  function filtradas() {
    return doc.hipoteses.filter(function (h) {
      if (ui.incremento === '' && h.incremento) return false;
      if (ui.incremento !== '*' && ui.incremento !== '' && h.incremento !== ui.incremento) return false;
      if (ui.filtro === 'por-testar') return V.porTestar(h);
      if (ui.filtro === 'sustentada' || ui.filtro === 'refutada') return h.estado === ui.filtro;
      return true;
    });
  }

  function cartaoSessao(s) {
    return el('li', { class: 'session' }, [
      el('div', { class: 'session__head' }, [tag(s.veredicto, ROT_ESTADO[s.veredicto]), el('span', { class: 'mono', text: s.data }), el('span', { text: '· ' + ROT_TIPO[s.tipo] + (s.participantes ? ' · ' + s.participantes : '') })]),
      el('div', { text: s.sinal }),
      el('div', { class: 'session__foot', text: (s.medido ? 'medido: ' + s.medido + ' · ' : '') + ROT_ACCAO[s.accao.tipo] + (s.accao.destino ? ' · ' + s.accao.destino : '') })
    ]);
  }

  function cartaoHipotese(h) {
    var tags = [tag(h.estado, ROT_ESTADO[h.estado])];
    if (h.critica) tags.push(tag('critica', 'crítica'));
    tags.push(tag('neutra', h.incremento ? nomeIncremento(h.incremento) : 'sem incremento'));
    if (h.origem) tags.push(tag('neutra', h.origem));

    var meta = [];
    if (h.problema) meta.push(el('div', null, [el('b', { text: 'Problema: ' }), h.problema]));
    if (h.utilizador) meta.push(el('div', null, [el('b', { text: 'Utilizador: ' }), h.utilizador]));
    if (V.metricaCompleta(h.metrica)) {
      meta.push(el('div', null, [el('b', { text: 'Métrica: ' }), h.metrica.indicador + ' · alvo ' + h.metrica.alvo + (h.metrica.como ? ' · ' + h.metrica.como : '')]));
    } else {
      meta.push(el('div', { class: 'card__warn', text: 'Métrica a completar — edita a hipótese.' }));
    }

    var accoes = [
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Registar sessão', onclick: function () { abrirSessao(h.id); } }),
      el('button', { class: 'btn btn--sm', type: 'button', text: 'Editar', onclick: function () { abrirHipotese(h.id); } })
    ];
    var seg = V.seguintes(h.estado);
    if (seg.length) {
      var sel = el('select', { class: 'select', 'aria-label': 'Novo estado' }, [el('option', { value: '', text: 'marcar estado…' })].concat(seg.map(function (e) { return el('option', { value: e, text: ROT_ESTADO[e] }); })));
      sel.addEventListener('change', function () {
        if (sel.value) aplicar(V.mudarEstado(doc, h.id, sel.value), 'estado: ' + ROT_ESTADO[sel.value]);
      });
      accoes.push(sel);
    }
    accoes.push(el('span', { class: 'grow' }));
    accoes.push(el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Apagar', onclick: function () {
      if (window.confirm('Apagar esta hipótese e as suas sessões? Não dá para desfazer.')) aplicar(V.apagarHipotese(doc, h.id), 'hipótese apagada');
    } }));

    return el('article', { class: 'card' }, [
      el('div', { class: 'card__tags' }, tags),
      el('h3', { class: 'card__title', text: h.aposta }),
      el('div', { class: 'card__meta' }, meta),
      h.sessoes.length ? el('ol', { class: 'sessions', 'aria-label': 'Sessões' }, h.sessoes.map(cartaoSessao)) : null,
      el('div', { class: 'card__actions' }, accoes)
    ]);
  }

  function renderHipoteses() {
    var sel = $('filtro-incremento');
    sel.textContent = '';
    sel.appendChild(el('option', { value: '*', text: 'Todos os incrementos' }));
    doc.incrementos.forEach(function (i) { sel.appendChild(el('option', { value: i.id, text: i.nome })); });
    sel.appendChild(el('option', { value: '', text: 'Sem incremento' }));
    if (ui.incremento !== '*' && ui.incremento !== '' && !doc.incrementos.some(function (i) { return i.id === ui.incremento; })) ui.incremento = '*';
    sel.value = ui.incremento;

    Array.prototype.forEach.call(document.querySelectorAll('[data-filtro]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filtro') === ui.filtro)); });

    var c = V.contagem(doc.hipoteses);
    function n(k, um, varios) { return k + ' ' + (k === 1 ? um : varios); }
    $('resumo').textContent = c.total
      ? [n(c.total, 'hipótese', 'hipóteses'), (c.aberta + c.insuficiente) + ' por testar', n(c.sustentada, 'sustentada', 'sustentadas'), n(c.refutada, 'refutada', 'refutadas')].join(' · ')
      : '';

    var lista = $('lista');
    lista.textContent = '';
    var hs = filtradas();
    if (!doc.hipoteses.length) {
      lista.appendChild(el('div', { class: 'empty' }, [
        el('p', { text: 'Ainda não há hipóteses. Cria a primeira — com a métrica que a vai pôr à prova — ou importa um ficheiro pelo menu.' })
      ]));
      return;
    }
    if (!hs.length) { lista.appendChild(el('p', { class: 'empty', text: 'Nenhuma hipótese neste filtro.' })); return; }
    hs.forEach(function (h) { lista.appendChild(cartaoHipotese(h)); });
  }

  /* ── vista decisões ──────────────────────────────────────────────────── */

  function cartaoDecisao(titulo, hs, alvo, historico) {
    var sug = V.sugerir(hs);
    var nome = 'dec-' + (alvo.incremento || alvo.hipotese);
    var porque = el('textarea', { class: 'textarea', rows: '2', maxlength: '500', placeholder: 'porquê — o que nas sessões te leva a esta decisão', 'aria-label': 'Porquê' });
    var escolhas = el('fieldset', { class: 'choices' }, [el('legend', { class: 'sr', text: 'Decisão' })].concat(V.DECISOES.map(function (d) {
      return el('label', { class: 'choice' }, [el('input', { type: 'radio', name: nome, value: d, checked: sug.sugestao === d }), ROT_DEC[d]]);
    })));
    var erro = el('p', { class: 'form__err', 'aria-live': 'assertive' });
    var botao = el('button', { class: 'btn btn--primary', type: 'button', text: 'Registar decisão', onclick: function () {
      var marcada = escolhas.querySelector('input:checked');
      var r = V.decidir(doc, alvo, { decisao: marcada ? marcada.value : '', porque: porque.value, data: V.hoje() });
      if (!r.ok) { erro.textContent = r.erro; return; }
      aplicar(r, 'decisão registada');
    } });

    return el('article', { class: 'card' }, [
      el('h3', { class: 'card__title', text: titulo }),
      el('div', { class: 'suggest' }, [el('span', { text: 'Sugestão:' }), tag(sug.sugestao, ROT_DEC[sug.sugestao]), el('span', { text: sug.motivo })]),
      el('ul', { class: 'hyps' }, hs.map(function (h) {
        return el('li', null, [tag(h.estado, ROT_ESTADO[h.estado]), el('span', { text: h.aposta + (h.critica ? '' : ' (não crítica)') })]);
      })),
      escolhas, porque, erro,
      el('div', { class: 'form__actions' }, [botao]),
      historico.length ? el('ol', { class: 'history', 'aria-label': 'Decisões anteriores' }, historico.slice().reverse().map(function (x) {
        return el('li', null, [tag(x.decisao, ROT_DEC[x.decisao]), ' ', el('span', { class: 'mono', text: x.data }), ' — ', x.porque]);
      })) : null
    ]);
  }

  function renderDecisoes() {
    var box = $('decisoes');
    box.textContent = '';
    var n = 0;
    doc.incrementos.forEach(function (inc) {
      var hs = V.doIncremento(doc, inc.id);
      if (!hs.length) return;
      n++;
      box.appendChild(cartaoDecisao(inc.nome, hs, { incremento: inc.id }, doc.decisoes.filter(function (x) { return x.incremento === inc.id; })));
    });
    doc.hipoteses.filter(function (h) { return !h.incremento; }).forEach(function (h) {
      n++;
      box.appendChild(cartaoDecisao('Hipótese solta: ' + h.aposta, [h], { hipotese: h.id }, doc.decisoes.filter(function (x) { return x.hipotese === h.id; })));
    });
    if (!n) box.appendChild(el('p', { class: 'empty', text: 'Sem hipóteses ainda. As decisões aparecem aqui por incremento.' }));
  }

  function render() {
    $('v-hipoteses').hidden = ui.vista !== 'hipoteses';
    $('v-decisoes').hidden = ui.vista !== 'decisoes';
    $('tab-hipoteses').setAttribute('aria-selected', String(ui.vista === 'hipoteses'));
    $('tab-decisoes').setAttribute('aria-selected', String(ui.vista === 'decisoes'));
    var dl = $('lista-incrementos');
    dl.textContent = '';
    doc.incrementos.forEach(function (i) { dl.appendChild(el('option', { value: i.nome })); });
    if (ui.vista === 'hipoteses') renderHipoteses(); else renderDecisoes();
  }

  /* ── diálogos ────────────────────────────────────────────────────────── */

  function abrirHipotese(id) {
    var f = $('form-hip');
    var h = id ? V.hipotese(doc, id) : null;
    ui.editar = id || null;
    $('dlg-hip-titulo').textContent = h ? 'Editar hipótese' : 'Nova hipótese';
    f.aposta.value = h ? h.aposta : '';
    f.problema.value = h ? h.problema : '';
    f.utilizador.value = h ? h.utilizador : '';
    f.indicador.value = h && h.metrica ? h.metrica.indicador : '';
    f.alvo.value = h && h.metrica ? h.metrica.alvo : '';
    f.como.value = h && h.metrica ? h.metrica.como : '';
    f.incremento.value = h ? nomeIncremento(h.incremento) : (ui.incremento !== '*' && ui.incremento !== '' ? nomeIncremento(ui.incremento) : '');
    f.critica.checked = h ? h.critica : true;
    $('erro-hip').textContent = '';
    $('dlg-hip').showModal();
    f.aposta.focus();
  }

  function guardarHipotese(ev) {
    ev.preventDefault();
    var f = $('form-hip');
    var r = V.guardarHipotese(doc, {
      id: ui.editar, aposta: f.aposta.value, problema: f.problema.value, utilizador: f.utilizador.value,
      metrica: { indicador: f.indicador.value, alvo: f.alvo.value, como: f.como.value },
      incrementoNome: f.incremento.value, critica: f.critica.checked
    });
    if (!r.ok) { $('erro-hip').textContent = r.erro; return; }
    $('dlg-hip').close();
    aplicar(r, ui.editar ? 'hipótese actualizada' : 'hipótese criada');
  }

  function actualizarLinhaEstado() {
    var f = $('form-sessao');
    var h = V.hipotese(doc, ui.sessaoDe);
    var v = f.veredicto.value;
    var pode = h && v && V.seguintes(h.estado).indexOf(v) >= 0;
    $('linha-actualizar').hidden = !pode;
    $('texto-actualizar').textContent = pode ? 'Marcar a hipótese como «' + ROT_ESTADO[v] + '»' : '';
  }

  function abrirSessao(id) {
    var f = $('form-sessao');
    var h = V.hipotese(doc, id);
    ui.sessaoDe = id;
    $('sessao-hipotese').textContent = h.aposta + (V.metricaCompleta(h.metrica) ? ' — alvo: ' + h.metrica.alvo : '');
    f.data.value = V.hoje();
    f.sinal.value = ''; f.medido.value = ''; f.veredicto.value = ''; f.accao.value = ''; f.destino.value = '';
    f.actualizar.checked = true;
    $('erro-sessao').textContent = '';
    actualizarLinhaEstado();
    $('dlg-sessao').showModal();
    f.sinal.focus();
  }

  function registarSessao(ev) {
    ev.preventDefault();
    var f = $('form-sessao');
    var r = V.registarSessao(doc, ui.sessaoDe, {
      data: f.data.value, tipo: f.tipo.value, participantes: f.participantes.value, sinal: f.sinal.value,
      medido: f.medido.value, veredicto: f.veredicto.value, accao: { tipo: f.accao.value, destino: f.destino.value }
    }, { actualizarEstado: !$('linha-actualizar').hidden && f.actualizar.checked });
    if (!r.ok) { $('erro-sessao').textContent = r.erro; return; }
    $('dlg-sessao').close();
    aplicar(r, 'sessão registada');
  }

  /* ── importar / exportar ─────────────────────────────────────────────── */

  function descarregar(nome, tipo, texto) {
    var url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    var a = el('a', { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importarFicheiro(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { avisar('ficheiro grande demais (máx. 2 MB)'); return; }
    file.text().then(function (t) {
      var r = V.importar(t);
      if (!r.ok) { avisar(r.erro); return; }
      if (doc.hipoteses.length && !window.confirm('Substituir as ' + doc.hipoteses.length + ' hipóteses deste browser pelas do ficheiro? Exporta antes se quiseres guardar as actuais.')) return;
      var k = r.doc.hipoteses.length;
      aplicar(r, 'importado: ' + k + (k === 1 ? ' hipótese' : ' hipóteses'));
    });
  }

  /* ── ligações ────────────────────────────────────────────────────────── */

  function fecharMenu() { $('menu').open = false; }

  $('btn-nova').addEventListener('click', function () { abrirHipotese(null); });
  $('form-hip').addEventListener('submit', guardarHipotese);
  $('form-sessao').addEventListener('submit', registarSessao);
  $('form-sessao').veredicto.addEventListener('change', actualizarLinhaEstado);
  Array.prototype.forEach.call(document.querySelectorAll('[data-fechar]'), function (b) {
    b.addEventListener('click', function () { b.closest('dialog').close(); });
  });
  $('tab-hipoteses').addEventListener('click', function () { ui.vista = 'hipoteses'; render(); });
  $('tab-decisoes').addEventListener('click', function () { ui.vista = 'decisoes'; render(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-filtro]'), function (b) {
    b.addEventListener('click', function () { ui.filtro = b.getAttribute('data-filtro'); render(); });
  });
  $('filtro-incremento').addEventListener('change', function (e) { ui.incremento = e.target.value; render(); });
  $('btn-importar').addEventListener('click', function () { fecharMenu(); $('ficheiro').click(); });
  $('ficheiro').addEventListener('change', function (e) { importarFicheiro(e.target.files[0]); e.target.value = ''; });
  $('btn-export-json').addEventListener('click', function () { fecharMenu(); descarregar('veredicto-' + V.hoje() + '.json', 'application/json', V.exportarJSON(doc)); });
  $('btn-export-md').addEventListener('click', function () { fecharMenu(); descarregar('veredicto-' + V.hoje() + '.md', 'text/markdown', V.exportarMarkdown(doc)); });
  document.addEventListener('click', function (e) { if (!$('menu').contains(e.target)) fecharMenu(); });
  store.aoMudar(function (novo) { doc = novo; render(); });

  render();
})();
