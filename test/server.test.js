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
    assert.match(await r.text(), /<title>Veredicto — Testa a aposta/);
    const app = await fetch(s.url + '/app');
    assert.equal(app.status, 200);
    assert.match(await app.text(), /id="btn-nova"/);
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

test('kit nimbleUI: ficheiros servidos, páginas carregam-no e o tema do kit só tem cor', async () => {
  const s = await servir();
  try {
    const base = s.url;
    for (const f of ['tokens.css', 'theme.js', 'behaviors.js']) assert.equal((await fetch(base + '/nimble/' + f)).status, 200, f);
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.html'), 'utf8');
    assert.ok(html.includes('/nimble/tokens.css') && html.includes('/nimble/theme.js') && html.includes('/nimble/behaviors.js'));
    const tokens = fs.readFileSync(path.join(__dirname, '..', 'public', 'nimble', 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, body] of tokens.matchAll(/\[data-theme[^{]*\{([^}]*)\}/g)) {
      for (const d of body.split(';').map((x) => x.trim()).filter(Boolean)) assert.match(d, /^(--[a-z0-9-]+|color-scheme)\s*:/, 'não-cor num bloco de tema: ' + d);
    }
  } finally { s.fechar(); }
});

test('a página de produto está em / e a app em /app; links antigos com ?projecto= vão para /app', async () => {
  const s = await servir();
  try {
    const home = await (await fetch(s.url + '/')).text();
    assert.match(home, /href="\/app"/);
    assert.doesNotMatch(home, /id="btn-nova"/);
    const r = await fetch(s.url + '/?projecto=abc-123', { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/app?projecto=abc-123');
  } finally { s.fechar(); }
});
