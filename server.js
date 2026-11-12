'use strict';
const path = require('node:path');
const express = require('express');

// Páginas estáticas. Modo local: os dados vivem no browser (localStorage). Modo monco (`/?projecto=<uuid>`):
// o browser fala directamente com o Supabase do projecto monco (RLS lá); o servidor só dá a config e a CSP.
// O URL e a chave publicável não são segredos (vão para o browser); a service role nunca entra aqui.
const SUPABASE_URL = 'https://lnvnfksaoirhpgdmxdpn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-tfgDWqIqOv2q9aQKmRZGA_jRgpoM_Q';
const CASCA_URL = 'https://nimble.monco.io';

function createApp(opts) {
  opts = opts || {};
  const env = process.env;
  const supabaseUrl = String(opts.supabaseUrl || env.SUPABASE_URL || SUPABASE_URL).replace(/\/+$/, '');
  const supabaseKey = String(opts.supabaseKey || env.SUPABASE_KEY || SUPABASE_KEY);
  const cascaUrl = String(opts.cascaUrl || env.CASCA_URL || CASCA_URL).replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s;'"]+$/.test(supabaseUrl)) throw new Error('SUPABASE_URL inválido');
  const configJs = 'window.MONCO_CONFIG = ' + JSON.stringify({ supabaseUrl, supabaseKey, cascaUrl }) + ';\n';

  const dir = path.join(__dirname, 'public');
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' " + supabaseUrl + "; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"
    });
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/config.js', (req, res) => {
    res.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.send(configJs);
  });
  app.use(express.static(dir, { index: 'index.html', extensions: ['html'] }));
  app.use((req, res) => res.status(404).sendFile(path.join(dir, 'index.html')));
  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Veredicto on port ${port}`));
}
