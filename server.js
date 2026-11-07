'use strict';
const path = require('node:path');
const express = require('express');

// v1 é só páginas estáticas: os dados vivem no browser de quem usa (localStorage) e saem por exportação.
// O servidor existe para as mesmas regras de segurança (CSP) das outras apps monco e para o modo monco mais tarde.
function createApp() {
  const dir = path.join(__dirname, 'public');
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"
    });
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use(express.static(dir, { index: 'index.html', extensions: ['html'] }));
  app.use((req, res) => res.status(404).sendFile(path.join(dir, 'index.html')));
  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Veredicto on port ${port}`));
}
