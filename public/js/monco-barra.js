/* Copiado de nimble/app/js/monco-barra.js em 2026-11-16 — sem pacote partilhado nem build.
 * Ao mudar o original, copiar de novo (e o CSS). */
'use strict';
/* monco-barra.js — a barra de apps dos projectos integrados: [C] Casca | [D] [R] [T] [V].
 *
 * Origem: nimble/app/js/monco-barra.js. Cada app tem uma cópia (sem pacote partilhado nem build):
 * ao mudar o original, copiar de novo (e o CSS, monco-barra.css).
 *
 * Todas as ligações passam pela Casca (`<casca>/app?ir=<app>&projecto=<id>&tema=<tema>`): é a Casca que
 * tem a sessão e que devolve a app com um token de acesso novo. As apps nunca guardam o token de renovação.
 * O tema segue na ligação (`tema=light|dark`), calculado no momento do clique.
 * Só as apps com modo monco (`monco: true`) são ligações; as outras aparecem apagadas. */
(function (raiz) {
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  /* a sequência do método: Idear, Priorizar, Construir, Validar. `cor` é o acento do kit nimbleUI. */
  var APPS = [
    { id: 'diagramico', letra: 'D', nome: 'Diagramico', etapa: '1 · Idear', cor: 'indigo', monco: false },
    { id: 'roadmaps', letra: 'R', nome: 'Roadmaps', etapa: '2 · Priorizar', cor: 'emerald', monco: false },
    { id: 'taskboards', letra: 'T', nome: 'Taskboards', etapa: '3 · Construir', cor: 'rose', monco: false },
    { id: 'veredicto', letra: 'V', nome: 'Veredicto', etapa: '4 · Validar', cor: 'amber', monco: true }
  ];

  function temaValido(t) { return t === 'light' || t === 'dark' ? t : null; }
  function projectoValido(p) { var v = String(p || '').toLowerCase(); return UUID.test(v) ? v : null; }
  function baseValida(u) {
    var b = String(u || '').replace(/\/+$/, '');
    return /^https?:\/\/[^\s?#]+$/.test(b) ? b : null;
  }
  function appPorId(id) { for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i]; return null; }

  /* Ligação de uma entrada da barra, sempre via Casca. `id` = 'casca' | id de uma app. null se não puder ser ligação. */
  function ligacao(cfg, id, tema) {
    var casca = baseValida(cfg && cfg.cascaUrl);
    if (!casca) return null;
    var projecto = projectoValido(cfg.projecto);
    var q = [];
    if (id !== 'casca') {
      var a = appPorId(id);
      if (!a || !a.monco || !projecto) return null;
      q.push('ir=' + encodeURIComponent(id));
    }
    if (projecto) q.push('projecto=' + encodeURIComponent(projecto));
    var t = temaValido(tema);
    if (t) q.push('tema=' + t);
    return casca + '/app' + (q.length ? '?' + q.join('&') : '');
  }

  function temaActual() { return temaValido(raiz.document && raiz.document.documentElement.getAttribute('data-theme')); }

  function el(tag, cls, texto) {
    var n = raiz.document.createElement(tag);
    if (cls) n.className = cls;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /* cfg: { atual: 'casca'|id, cascaUrl, projecto, aoIr(id) opcional (a Casca trata a navegação ela própria) } */
  function montar(contentor, cfg) {
    var nav = el('nav', 'mb');
    nav.setAttribute('aria-label', 'Apps do projecto');
    var entradas = [];

    function entrada(id, cor, letra, nome, dica, extra) {
      var href = ligacao(cfg, id, temaActual());
      var atual = cfg.atual === id;
      var n = href ? el('a', 'mb__item') : el('span', 'mb__item is-off');
      if (href) n.setAttribute('href', href); else n.setAttribute('aria-disabled', 'true');
      if (atual) n.setAttribute('aria-current', 'page');
      n.setAttribute('data-cor', cor);
      n.setAttribute('title', dica);
      n.setAttribute('aria-label', dica);
      n.appendChild(el('span', 'mb__ico', letra));
      if (extra) n.appendChild(el('span', 'mb__nome', extra));
      if (href && typeof cfg.aoIr === 'function' && !atual) {
        n.addEventListener('click', function (ev) {
          if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
          ev.preventDefault();
          cfg.aoIr(id);
        });
      }
      entradas.push({ n: n, id: id, href: !!href });
      nav.appendChild(n);
    }

    // na própria Casca (cfg.semCasca) a marca "C Casca" já está no cabeçalho: só se mostra o separador e as apps
    if (!cfg.semCasca) entrada('casca', 'orange', 'C', 'Casca', 'Casca — os projectos', 'Casca');
    var sep = el('span', 'mb__sep');
    sep.setAttribute('aria-hidden', 'true');
    nav.appendChild(sep);
    APPS.forEach(function (a) {
      var dica = a.nome + ' · ' + a.etapa;
      var temLigacao = a.monco && projectoValido(cfg.projecto);
      entrada(a.id, a.cor, a.letra, a.nome, temLigacao || cfg.atual === a.id ? dica : dica + (a.monco ? ' — abre um projecto primeiro' : ' — modo monco em breve'));
    });

    /* o tema muda sem recarregar a página: refrescar as ligações quando muda e antes de cada clique */
    function refrescar() {
      var t = temaActual();
      entradas.forEach(function (e) { if (e.href) e.n.setAttribute('href', ligacao(cfg, e.id, t)); });
    }
    ['pointerdown', 'focusin', 'keydown'].forEach(function (ev) { nav.addEventListener(ev, refrescar); });
    raiz.document.addEventListener('nimble:theme', refrescar);
    var obs = raiz.MutationObserver ? new raiz.MutationObserver(refrescar) : null;
    if (obs) obs.observe(raiz.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    contentor.textContent = '';
    contentor.appendChild(nav);
    return { nav: nav, refrescar: refrescar };
  }

  var api = { APPS: APPS, ligacao: ligacao, montar: montar, temaValido: temaValido, projectoValido: projectoValido, baseValida: baseValida, appPorId: appPorId };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.MoncoBarra = api;
})(this);
