'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../server.js');
const B = require('../public/js/monco-barra.js');

const ID = '11111111-2222-4333-8444-555555555555';
const pub = (...p) => path.join(__dirname, '..', 'public', ...p);

test('a barra liga sempre à Casca (com projecto e tema) e só ao Veredicto, que tem modo monco', () => {
  const cfg = { cascaUrl: 'https://nimble.monco.io', projecto: ID };
  assert.equal(B.ligacao(cfg, 'casca', 'dark'), 'https://nimble.monco.io/app?projecto=' + ID + '&tema=dark');
  assert.equal(B.ligacao(cfg, 'veredicto', 'light'), 'https://nimble.monco.io/app?ir=veredicto&projecto=' + ID + '&tema=light');
  assert.equal(B.ligacao(cfg, 'roadmaps', 'dark'), null);
  assert.deepEqual(B.APPS.map((a) => a.letra), ['D', 'R', 'T', 'V']);
});

test('monco-barra.css: blocos [data-theme] só têm cores', () => {
  const css = fs.readFileSync(pub('monco-barra.css'), 'utf8');
  const blocos = css.match(/\[data-theme="(light|dark)"\]\s*\{[^}]*\}/g) || [];
  assert.equal(blocos.length, 2);
  for (const b of blocos) {
    for (const p of b.replace(/^[^{]*\{|\}$/g, '').split(';').map((x) => x.split(':')[0].trim()).filter(Boolean)) {
      assert.ok(p.startsWith('--') || p === 'color-scheme', 'não-cor no tema: ' + p);
    }
  }
});

test('o Veredicto serve a barra e o supa.js sem o token de renovação nas ligações', async () => {
  const s = await new Promise((ok) => { const srv = createApp().listen(0, () => ok(srv)); });
  const url = 'http://127.0.0.1:' + s.address().port;
  try {
    for (const f of ['/monco-barra.css', '/js/monco-barra.js', '/js/supa.js']) assert.equal((await fetch(url + f)).status, 200, f);
    const html = await (await fetch(url + '/app')).text();
    assert.ok(html.includes('/monco-barra.css') && html.includes('/js/monco-barra.js') && html.includes('id="mb"'));
    const app = fs.readFileSync(pub('js', 'app.js'), 'utf8');
    assert.ok(!/refresh_token/.test(app), 'a app não toca no refresh_token');
    assert.match(app, /sessionStorage/, 'em modo monco a sessão fica no sessionStorage');
  } finally { s.close(); }
});
