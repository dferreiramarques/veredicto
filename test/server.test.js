'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../server.js');

function servir() {
  return new Promise((ok) => {
    const s = createApp().listen(0, () => ok({ url: 'http://127.0.0.1:' + s.address().port, fechar: () => s.close() }));
  });
}

test('serve a app com CSP estrita e o healthz', async () => {
  const s = await servir();
  try {
    const r = await fetch(s.url + '/');
    assert.equal(r.status, 200);
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self';/);
    assert.doesNotMatch(csp, /unsafe-inline/);
    assert.match(await r.text(), /<title>Veredicto<\/title>/);
    assert.deepEqual(await (await fetch(s.url + '/healthz')).json(), { ok: true });
    assert.equal((await fetch(s.url + '/js/core.js')).status, 200);
  } finally { s.fechar(); }
});

test('as páginas não têm scripts nem style="" inline', () => {
  const dir = path.join(__dirname, '..', 'public');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, f + ': script inline');
    assert.doesNotMatch(html, /\sstyle="/, f + ': style inline');
    assert.doesNotMatch(html, /\son[a-z]+="/, f + ': handler inline');
  }
});

test('tema: blocos [data-theme] só têm propriedades de cor', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.css'), 'utf8');
  const blocos = css.match(/\[data-theme="(light|dark)"\]\s*\{[^}]*\}/g) || [];
  assert.equal(blocos.length, 2);
  for (const b of blocos) {
    const props = b.replace(/^[^{]*\{|\}$/g, '').split(';').map((p) => p.split(':')[0].trim()).filter(Boolean);
    for (const p of props) assert.ok(p.startsWith('--') || p === 'color-scheme', 'propriedade não-cor no tema: ' + p);
  }
});
