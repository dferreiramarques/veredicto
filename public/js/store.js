'use strict';
/* store.js — a costura de armazenamento: ler() / escrever(doc) / aoMudar(cb) / disponivel().
 *
 * local  — localStorage (o Veredicto standalone, sem projecto).
 * monco  — a fatia `veredicto` de um projecto monco no Supabase (esquema-projecto §3.5).
 *          A costura é síncrona e o Supabase não: abrir() carrega as fatias `veredicto` e `taskboards`
 *          antes de a app arrancar e guarda-as em memória; ler() devolve a memória; escrever(doc) actualiza
 *          a memória e agenda gravar_fatia (debounce) com a versão lida. Os incrementos vêm das boards
 *          `tipo: "incremento"` do Taskboards, só de leitura — nunca são gravados na fatia do Veredicto.
 *          Conflito → fica à espera do humano (usarDeles / gravarPorCima); nunca grava por cima sozinho. */
(function (raiz) {
  function local(Core, chave) {
    chave = chave || 'veredicto-dados';
    var disponivel = true;
    function ler() {
      try {
        var t = raiz.localStorage.getItem(chave);
        return t ? Core.limpar(JSON.parse(t)) : Core.vazio();
      } catch (e) { disponivel = false; return Core.vazio(); }
    }
    function escrever(doc) {
      try { raiz.localStorage.setItem(chave, JSON.stringify(doc)); return true; }
      catch (e) { disponivel = false; return false; }
    }
    function aoMudar(cb) {
      raiz.addEventListener('storage', function (ev) { if (ev.key === chave) cb(ler()); });
    }
    return { nome: 'local', ler: ler, escrever: escrever, aoMudar: aoMudar, disponivel: function () { return disponivel; } };
  }

  /* ── modo monco ─────────────────────────────────────────────────────────── */

  /* boards `tipo: "incremento"` da fatia taskboards → [{ id, nome }] (o Core.limpar filtra o resto). */
  function incrementosDe(dadosTaskboards) {
    var boards = dadosTaskboards && Array.isArray(dadosTaskboards.boards) ? dadosTaskboards.boards : [];
    return boards.filter(function (b) { return b && b.tipo === 'incremento'; }).map(function (b) { return { id: b.id, nome: b.name }; });
  }

  /* o que se grava: §3.5, sem `incrementos` */
  function fatiaDe(doc) {
    return { app: 'veredicto', versao: 1, hipoteses: JSON.parse(JSON.stringify(doc.hipoteses)), decisoes: JSON.parse(JSON.stringify(doc.decisoes)) };
  }

  /* opts: { atraso (ms, omissão 800), documento (para visibilitychange; omissão window.document), agora } */
  function monco(Core, supa, projecto, opts) {
    opts = opts || {};
    var atraso = opts.atraso == null ? 800 : opts.atraso;
    var documento = opts.documento !== undefined ? opts.documento : raiz.document;
    var agora = opts.agora || function () { return Date.now(); };

    var st = {
      aberto: false, nome: '', podeEscrever: false, acesso: null,
      doc: Core.vazio(), incs: [], versao: 0, por: null, em: null,
      pendente: false, emVoo: null, repetir: false, conflito: null, erro: null
    };
    var timer = null;
    var ouvMudar = [], ouvEstado = [];
    var nomes = {};

    function compor(dados, incs) { return Core.limpar(dados, { incrementos: incs }); }
    function eu() { var u = supa.utilizador(); return u ? u.id : null; }

    function nomeDe(conta) {
      if (!conta) return Promise.resolve('alguém');
      if (conta === eu()) return Promise.resolve('ti, noutra aba ou noutro browser');
      if (nomes[conta]) return Promise.resolve(nomes[conta]);
      return supa.perfis([conta]).then(function (r) {
        var n = r && r[0] && r[0].nome ? String(r[0].nome) : 'alguém';
        nomes[conta] = n; return n;
      }, function () { return 'alguém'; });
    }

    function estado() {
      return {
        fase: st.conflito ? 'conflito' : st.erro ? 'erro' : st.emVoo ? 'a-gravar' : st.pendente ? 'por-gravar' : 'gravado',
        podeEscrever: st.podeEscrever, acesso: st.acesso, versao: st.versao, por: st.por, em: st.em,
        conflito: st.conflito ? { versao: st.conflito.versao, por: st.conflito.por, em: st.conflito.em, nome: st.conflito.nome } : null,
        erro: st.erro
      };
    }
    function emitir() { var e = estado(); ouvEstado.forEach(function (cb) { cb(e); }); }

    function marcarConflito(c) {
      clearTimeout(timer);
      st.conflito = { versao: c.versao, dados: c.dados, por: c.por || null, em: c.em || null, nome: null };
      var este = st.conflito;
      emitir();
      return nomeDe(este.por).then(function (n) { if (st.conflito === este) { este.nome = n; emitir(); } });
    }

    function aplicarFatias(fatias) {
      var por = {};
      (Array.isArray(fatias) ? fatias : []).forEach(function (f) { if (f && f.app) por[f.app] = f; });
      var v = por.veredicto, t = por.taskboards;
      st.incs = incrementosDe(t && t.dados);
      st.doc = compor(v && v.dados, st.incs);
      st.versao = v ? Number(v.versao) || 0 : 0;
      st.por = v ? v.por || null : null;
      st.em = v ? v.em || null : null;
    }

    function abrir() {
      return Promise.all([supa.lerProjecto(projecto), supa.lerFatias(projecto), supa.listarMembros(projecto)]).then(function (r) {
        var p = r[0];
        if (!p) { var e = new Error('este projecto não existe ou não tens acesso a ele'); e.codigo = 'sem-acesso'; throw e; }
        var u = eu();
        var m = (Array.isArray(r[2]) ? r[2] : []).filter(function (x) { return x && x.conta === u; })[0] || null;
        st.nome = String(p.nome || '');
        st.acesso = m ? m.acesso : null;
        st.podeEscrever = !!m && (m.acesso === 'dono' || m.acesso === 'editor') && Array.isArray(m.apps) && m.apps.indexOf('veredicto') >= 0;
        aplicarFatias(r[1]);
        st.aberto = true;
        if (documento && documento.addEventListener) {
          documento.addEventListener('visibilitychange', function () { if (documento.visibilityState === 'visible') reler(); });
        }
        emitir();
        return { nome: st.nome, podeEscrever: st.podeEscrever, acesso: st.acesso, versao: st.versao };
      });
    }

    function ler() { return st.doc; }

    function escrever(doc) {
      if (!st.aberto || !st.podeEscrever) return false;
      st.doc = compor(doc, st.incs);
      st.pendente = true;
      st.erro = null;
      if (!st.conflito) { clearTimeout(timer); timer = setTimeout(function () { gravar(); }, atraso); }
      emitir();
      return true;
    }

    /* grava o que está pendente com a versão lida (ou `versaoForcada`, para «gravar por cima») */
    function gravar(versaoForcada) {
      clearTimeout(timer);
      if (st.emVoo) { st.repetir = true; return st.emVoo; }
      if (!st.pendente || !st.podeEscrever || (st.conflito && versaoForcada == null)) return Promise.resolve(estado());
      var versao = versaoForcada != null ? versaoForcada : st.versao;
      st.pendente = false;
      st.conflito = null;
      st.emVoo = supa.gravarFatia(projecto, 'veredicto', fatiaDe(st.doc), versao).then(function (r) {
        st.emVoo = null;
        if (r && r.ok) {
          st.versao = Number(r.versao) || versao + 1;
          st.por = eu(); st.em = new Date(agora()).toISOString();
          st.erro = null;
        } else if (r && r.conflito) {
          st.pendente = true;
          marcarConflito(r);
        } else {
          st.pendente = true;
          st.erro = 'resposta inesperada do servidor';
        }
      }, function (e) {
        st.emVoo = null;
        st.pendente = true;
        st.erro = e && e.message ? e.message : 'falha de rede';
      }).then(function () {
        emitir();
        if (st.repetir) { st.repetir = false; if (st.pendente && !st.conflito && !st.erro) return gravar(); }
        return estado();
      });
      emitir();
      return st.emVoo;
    }

    function usarDeles() {
      var c = st.conflito;
      if (!c) return st.doc;
      clearTimeout(timer);
      st.doc = compor(c.dados, st.incs);
      st.versao = c.versao; st.por = c.por; st.em = c.em;
      st.conflito = null; st.pendente = false; st.erro = null;
      emitir();
      return st.doc;
    }

    function gravarPorCima() {
      var c = st.conflito;
      if (!c) return gravar();
      return gravar(c.versao);
    }

    /* ao voltar ao separador: reler as fatias; versão nova sem alterações locais → adoptar e avisar;
       com alterações locais por gravar → conflito (o humano escolhe). Incrementos novos/apagados entram sempre. */
    function reler() {
      if (!st.aberto || st.emVoo) return Promise.resolve(null);
      return supa.lerFatias(projecto).then(function (fatias) {
        var por = {};
        (Array.isArray(fatias) ? fatias : []).forEach(function (f) { if (f && f.app) por[f.app] = f; });
        var v = por.veredicto, t = por.taskboards;
        var incs = incrementosDe(t && t.dados);
        var mudouIncs = JSON.stringify(compor(null, incs).incrementos) !== JSON.stringify(st.doc.incrementos);
        st.incs = incs;
        if (v && Number(v.versao) !== st.versao) {
          if (st.pendente || st.emVoo) { marcarConflito(v); return { conflito: true }; }
          st.doc = compor(v.dados, incs);
          st.versao = Number(v.versao) || 0; st.por = v.por || null; st.em = v.em || null;
          return nomeDe(st.por).then(function (n) {
            ouvMudar.forEach(function (cb) { cb(st.doc, { versao: st.versao, nome: n }); });
            emitir();
            return { versao: st.versao, nome: n };
          });
        }
        if (mudouIncs) {
          st.doc = compor(fatiaDe(st.doc), incs);
          ouvMudar.forEach(function (cb) { cb(st.doc, { incrementos: true }); });
          emitir();
          return { incrementos: true };
        }
        return null;
      }, function () { return null; });
    }

    return {
      nome: 'monco',
      abrir: abrir, ler: ler, escrever: escrever,
      aoMudar: function (cb) { ouvMudar.push(cb); },
      aoEstado: function (cb) { ouvEstado.push(cb); },
      disponivel: function () { return !st.erro; },
      estado: estado,
      gravarJa: function () { return gravar(); },
      usarDeles: usarDeles, gravarPorCima: gravarPorCima, reler: reler,
      porGravar: function () { return st.pendente || !!st.emVoo; }
    };
  }

  var api = { local: local, monco: monco, incrementosDe: incrementosDe, fatiaDe: fatiaDe };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.VeredictoStore = api;
})(this);
