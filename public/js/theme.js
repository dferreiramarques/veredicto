'use strict';
// Carregado no <head>, antes de pintar, para o tema guardado nunca piscar.
// Claro / escuro só trocam cores (ver app.css); nada mais muda na página.
(function () {
  var KEY = 'veredicto-theme';
  var theme = 'dark';
  try { theme = localStorage.getItem(KEY) || 'dark'; } catch (e) {}
  document.documentElement.setAttribute('data-theme', theme);

  var SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  var MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
  var svg = function (p) { return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };

  function apply(t, btns) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    btns.forEach(function (b) { b.innerHTML = svg(t === 'dark' ? SUN : MOON); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btns = Array.prototype.slice.call(document.querySelectorAll('[data-theme-toggle]'));
    if (!btns.length) return;
    apply(document.documentElement.getAttribute('data-theme'), btns);
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', btns);
      });
    });
  });
})();
