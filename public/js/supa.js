/* Copiado de nimble/app/js/supa.js (commit 624a8db) em 2026-11-12 — sem pacote partilhado nem build.
 * Ao mudar o original, copiar de novo. */
'use strict';
/* supa.js — cliente mínimo do Supabase (Auth + REST) sem dependências.
 * Login por link mágico (fluxo implícito: os tokens chegam no #hash do redirect), refresh automático,
 * e as chamadas que a Casca usa. `fetch`, `storage` e `agora` injectáveis para os testes. */
(function (raiz) {
  var CHAVE = 'monco-sessao';

  function criar(opts) {
    var url = String(opts.url).replace(/\/+$/, '');
    var key = opts.key;
    var f = opts.fetch || raiz.fetch.bind(raiz);
    var storage = opts.storage || raiz.localStorage;
    var agora = opts.agora || function () { return Date.now(); };
    var sessao = null;

    function guardar(s) {
      sessao = s;
      try { if (s) storage.setItem(CHAVE, JSON.stringify(s)); else storage.removeItem(CHAVE); } catch (e) { /* sem storage: sessão só em memória */ }
    }
    try { sessao = JSON.parse(storage.getItem(CHAVE) || 'null'); } catch (e) { sessao = null; }

    function erroDe(r, corpo) {
      var m = corpo && (corpo.message || corpo.msg || corpo.error_description || corpo.error) || ('HTTP ' + r.status);
      var e = new Error(m);
      e.status = r.status; e.code = corpo && corpo.code;
      return e;
    }

    function pedido(metodo, caminho, corpo, extra) {
      var h = { apikey: key, 'Content-Type': 'application/json' };
      Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
      return f(url + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
        .then(function (r) {
          return r.text().then(function (t) {
            var j = null;
            try { j = t ? JSON.parse(t) : null; } catch (e) { j = { message: t }; }
            if (!r.ok) throw erroDe(r, j);
            return j;
          });
        });
    }

    function deTokens(t) {
      return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: agora() + (Number(t.expires_in) || 3600) * 1000, user: t.user ? { id: t.user.id, email: t.user.email } : null };
    }

    /* #access_token=…&refresh_token=…&expires_in=…  ou  #error=…&error_description=… */
    function lerHash(hash) {
      var p = {};
      String(hash || '').replace(/^#/, '').split('&').forEach(function (par) {
        var i = par.indexOf('=');
        if (i > 0) p[decodeURIComponent(par.slice(0, i))] = decodeURIComponent(par.slice(i + 1).replace(/\+/g, ' '));
      });
      if (p.error || p.error_description) return { erro: p.error_description || p.error };
      if (p.access_token && p.refresh_token) return { tokens: p };
      return null;
    }

    function entrarComHash(hash) {
      var h = lerHash(hash);
      if (!h) return Promise.resolve(null);
      if (h.erro) return Promise.reject(new Error(h.erro));
      var s = deTokens(h.tokens);
      guardar(s);
      return pedido('GET', '/auth/v1/user', undefined, { Authorization: 'Bearer ' + s.access_token }).then(function (u) {
        s.user = { id: u.id, email: u.email };
        guardar(s);
        return s.user;
      });
    }

    function enviarLink(email, redirectTo) {
      return pedido('POST', '/auth/v1/otp?redirect_to=' + encodeURIComponent(redirectTo), { email: email, create_user: true });
    }

    var refrescando = null;
    function refrescar() {
      if (!sessao || !sessao.refresh_token) return Promise.reject(new Error('sem sessão'));
      if (!refrescando) {
        refrescando = pedido('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: sessao.refresh_token })
          .then(function (t) { var s = deTokens(t); if (!s.user) s.user = sessao.user; guardar(s); return s; })
          .catch(function (e) { if (e.status === 400 || e.status === 401) guardar(null); throw e; })
          .then(function (s) { refrescando = null; return s; }, function (e) { refrescando = null; throw e; });
      }
      return refrescando;
    }

    function token() {
      if (!sessao) return Promise.reject(Object.assign(new Error('sem sessão'), { status: 401 }));
      if (sessao.expires_at - agora() > 60000) return Promise.resolve(sessao.access_token);
      return refrescar().then(function (s) { return s.access_token; });
    }

    /* pedido autenticado; um 401 força um refresh e repete uma vez */
    function auth(metodo, caminho, corpo, extra) {
      function ir(tok) {
        var h = { Authorization: 'Bearer ' + tok };
        Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
        return pedido(metodo, caminho, corpo, h);
      }
      return token().then(ir).catch(function (e) {
        if (e.status !== 401 || !sessao) throw e;
        return refrescar().then(function (s) { return ir(s.access_token); });
      });
    }

    function sair() {
      var s = sessao;
      guardar(null);
      if (!s) return Promise.resolve();
      return pedido('POST', '/auth/v1/logout', {}, { Authorization: 'Bearer ' + s.access_token }).catch(function () {});
    }

    var enc = encodeURIComponent;
    var REP = { Prefer: 'return=representation' };

    return {
      utilizador: function () { return sessao && sessao.user; },
      entrarComHash: entrarComHash, enviarLink: enviarLink, sair: sair, refrescar: refrescar, lerHash: lerHash,

      listarProjectos: function () { return auth('GET', '/rest/v1/projectos?select=id,nome,criado_em,criado_por&arquivado=is.false&order=criado_em.desc'); },
      criarProjecto: function (nome) { return auth('POST', '/rest/v1/projectos?select=id,nome,criado_em,criado_por', { nome: nome }, REP).then(function (r) { return r[0]; }); },
      lerProjecto: function (id) { return auth('GET', '/rest/v1/projectos?select=id,nome,criado_em,criado_por&id=eq.' + enc(id)).then(function (r) { return r[0] || null; }); },
      renomearProjecto: function (id, nome) { return auth('PATCH', '/rest/v1/projectos?id=eq.' + enc(id), { nome: nome }); },
      arquivarProjecto: function (id) { return auth('PATCH', '/rest/v1/projectos?id=eq.' + enc(id), { arquivado: true }); },

      lerFatias: function (id) { return auth('GET', '/rest/v1/fatias?select=app,dados,versao,por,em&projecto=eq.' + enc(id)); },
      gravarFatia: function (id, app, dados, versaoLida) { return auth('POST', '/rest/v1/rpc/gravar_fatia', { p_projecto: id, p_app: app, p_dados: dados, p_versao_lida: versaoLida }); },

      listarMembros: function (id) { return auth('GET', '/rest/v1/membros?select=conta,acesso,apps&projecto=eq.' + enc(id)); },
      perfis: function (contas) {
        if (!contas.length) return Promise.resolve([]);
        return auth('GET', '/rest/v1/perfis?select=conta,nome&conta=in.(' + contas.map(enc).join(',') + ')');
      },
      adicionarMembro: function (id, email, acesso) { return auth('POST', '/rest/v1/rpc/adicionar_membro', { p_projecto: id, p_email: email, p_acesso: acesso }); },
      mudarAcesso: function (id, conta, acesso) { return auth('PATCH', '/rest/v1/membros?projecto=eq.' + enc(id) + '&conta=eq.' + enc(conta), { acesso: acesso }, REP); },
      removerMembro: function (id, conta) { return auth('DELETE', '/rest/v1/membros?projecto=eq.' + enc(id) + '&conta=eq.' + enc(conta), undefined, REP); }
    };
  }

  var api = { criar: criar, CHAVE: CHAVE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Supa = api;
})(this);
