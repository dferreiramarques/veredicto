'use strict';
/* store.js — a costura de armazenamento: ler() / escrever(doc) / aoMudar(cb).
 * v1 tem só o adaptador local (localStorage). O modo monco (fatias `hipoteses[]` e `decisoes[]`
 * do projecto na Casca) entra por trás desta mesma interface. */
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
  raiz.VeredictoStore = { local: local };
})(this);
