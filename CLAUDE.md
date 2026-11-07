# CLAUDE.md — Veredicto

Instruções para o Claude Code neste repo. A especificação está em `nimble-suite/docs/metodo-operacional.md` §8.

## O que é
A etapa **Validar** do método monco: hipóteses com **métrica obrigatória**, sessões de teste (1 sessão = 1 linha = 1 veredicto) e, no fim de cada incremento, a decisão **perseverar / ajustar / matar** com um porquê. Hipóteses soltas (spikes) decidem-se ao nível da hipótese.
Node + Express, vanilla JS, **sem build**. Destino: `veredicto.monco.io` (Railway, como o Roadmaps). UI em PT-PT; o director fala português.

## Comandos
```bash
npm install
npm test            # node:test — modelo (core), servidor, CSP, regra do tema
npm start           # http://localhost:3000
```

## Estrutura
- `server.js` CSP + estáticos · `public/index.html` a app · `public/app.css` tokens + componentes · `public/js/theme.js`
- `public/js/core.js` **o modelo** (sem DOM, UMD): limpeza, estados, sessões, sugestão, decisão, importar (JSON + YAML do v0), exportar JSON/Markdown
- `public/js/store.js` a costura de armazenamento `ler() / escrever() / aoMudar()` — hoje só `local` (localStorage)
- `public/js/app.js` a interface · `test/` testes · `test/fixtures/validacoes-v0.yaml` ledger do v0

## Regras
1. **Claro/escuro só trocam cores** (tokens por tema; tudo o resto em `:root`). Há um teste que falha se um bloco `[data-theme]` tiver propriedades não-cor. Ao mexer na UI, comparar estilos calculados nos dois temas.
2. **Texto do utilizador é texto**: `textContent` / `el()`; `innerHTML` só para ícones estáticos.
3. **Sem scripts nem `style=""` inline** (CSP). Há teste.
4. **A app sugere, o humano decide**: o estado da hipótese e a decisão do incremento nunca mudam sozinhos. Estados só avançam (`aberta → sustentada | refutada | insuficiente`, `insuficiente → sustentada | refutada`).
5. **Nunca confiar no que entra**: tudo passa por `core.limpar()` (caps, ids únicos, referências partidas descartadas).
6. Funções do `core` que mudam dados devolvem `{ ok, erro?, doc? }` e **não mutam** o documento recebido.
7. Ecrã de 375 px sem scroll horizontal.
8. Sem dependências novas além do Express sem perguntar.

## Próximo (fora do v1)
Modo monco (`store.monco`: fatias `hipoteses[]`/`decisoes[]` do projecto na Casca) · ligação a incrementos do Taskboards e features do Roadmaps por id · product page.

## Estilo
Responder ao director em português, conciso. **Commit e push só quando pedido.** Verificar UI no browser (preview), não só no código.
