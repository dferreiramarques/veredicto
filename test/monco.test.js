'use strict';
/* Modo monco: o adaptador store.monco sobre o cliente supa.js real, com um `fetch` falso que imita o Supabase
 * (fatias com versão, gravar_fatia com conflito, membros com acesso/apps). */
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/core.js');
const Supa = require('../public/js/supa.js');
const Store = require('../public/js/store.js');
const { createApp } = require('../server.js');

const PROJ = '11111111-2222-4333-8444-555555555555';
const EU = 'aaaaaaaa-0000-4000-8000-000000000001';
const ANA = 'aaaaaaaa-0000-4000-8000-000000000002';

function falso(opcoes) {
  opcoes = opcoes || {};
  const db = {
    fatias: {
      veredicto: { app: 'veredicto', dados: opcoes.veredicto || { app: 'veredicto', versao: 1, hipoteses: [], decisoes: [] }, versao: 1, por: ANA, em: '2026-11-12T10:00:00Z' },
      taskboards: { app: 'taskboards', dados: opcoes.taskboards || { boards: [
        { id: 'inc_semente01', name: 'Incremento 1 — onboarding', tipo: 'incremento', cards: [] },
        { id: 'brd_ideias01', name: 'Ideias', tipo: 'idear', cards: [] }
      ] }, versao: 3, por: ANA, em: '2026-11-12T09:00:00Z' }
    },
    membro: Object.assign({ conta: EU, acesso: 'editor', apps: ['casca', 'roadmaps', 'taskboards', 'diagramico', 'veredicto'] }, opcoes.membro || {}),
    chamadas: []
  };
  function resp(status, corpo) {
    return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(corpo === undefined ? '' : JSON.stringify(corpo)) });
  }
  const fetch = (url, init) => {
    const u = new URL(url);
    const corpo = init.body ? JSON.parse(init.body) : undefined;
    db.chamadas.push({ metodo: init.method, caminho: u.pathname, corpo });
    if (u.pathname === '/rest/v1/projectos') return resp(200, opcoes.semProjecto ? [] : [{ id: PROJ, nome: 'Receitas', criado_em: '2026-11-01T00:00:00Z', criado_por: ANA }]);
    if (u.pathname === '/rest/v1/fatias') return resp(200, Object.values(db.fatias));
    if (u.pathname === '/rest/v1/membros') return resp(200, [db.membro, { conta: ANA, acesso: 'dono', apps: db.membro.apps }]);
    if (u.pathname === '/rest/v1/perfis') return resp(200, [{ conta: ANA, nome: 'Ana' }]);
    if (u.pathname === '/rest/v1/rpc/gravar_fatia') {
      if (db.membro.acesso === 'leitor' || !db.membro.apps.includes(corpo.p_app)) return resp(403, { code: '42501', message: 'sem permissão' });
      const f = db.fatias[corpo.p_app];
      if (f.versao !== corpo.p_versao_lida) return resp(200, { ok: false, conflito: true, versao: f.versao, dados: f.dados, por: f.por, em: f.em });
      Object.assign(f, { dados: corpo.p_dados, versao: f.versao + 1, por: EU, em: new Date().toISOString() });
      return resp(200, { ok: true, versao: f.versao });
    }
    return resp(404, { message: 'sem rota ' + u.pathname });
  };
  const mem = { 'monco-sessao': JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600e3, user: { id: EU, email: 'eu@monco.io' } }) };
  const storage = { getItem: (k) => mem[k] || null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  const supa = Supa.criar({ url: 'http://supa.test', key: 'falsa', fetch, storage });
  return { db, supa, store: Store.monco(Core, supa, PROJ, { atraso: 0, documento: null }) };
}

const HIP = { aposta: 'Se mostrarmos receitas por ingrediente, então mais gente guarda receitas', metrica: { indicador: 'receitas guardadas por sessão', alvo: '≥ 2' }, incrementoNome: 'Incremento 1 — onboarding' };

test('monco: abrir lê o projecto, as fatias e o acesso; incrementos vêm das boards tipo incremento', async () => {
  const { store } = falso();
  const info = await store.abrir();
  assert.deepEqual(info, { nome: 'Receitas', podeEscrever: true, acesso: 'editor', versao: 1 });
  assert.deepEqual(store.ler().incrementos, [{ id: 'inc_semente01', nome: 'Incremento 1 — onboarding' }]);
  assert.equal(store.estado().fase, 'gravado');
});

test('monco: criar hipótese ligada ao incremento grava com a versão lida e sem `incrementos`', async () => {
  const { store, db } = falso();
  await store.abrir();
  const r = Core.guardarHipotese(store.ler(), HIP, { criarIncremento: false });
  assert.ok(r.ok);
  assert.equal(store.escrever(r.doc), true);
  assert.equal(store.estado().fase, 'por-gravar');
  await store.gravarJa();
  const rpc = db.chamadas.filter((c) => c.caminho === '/rest/v1/rpc/gravar_fatia');
  assert.equal(rpc.length, 1);
  assert.equal(rpc[0].corpo.p_versao_lida, 1);
  assert.deepEqual(Object.keys(rpc[0].corpo.p_dados).sort(), ['app', 'decisoes', 'hipoteses', 'versao']);
  assert.equal(db.fatias.veredicto.versao, 2);
  assert.equal(db.fatias.veredicto.dados.hipoteses[0].incremento, 'inc_semente01');
  assert.equal(db.fatias.veredicto.dados.incrementos, undefined);
  assert.equal(store.estado().versao, 2);

  // reabrir (recarregar a página): lá está
  const { store: s2 } = falso({ veredicto: db.fatias.veredicto.dados });
  await s2.abrir();
  assert.equal(s2.ler().hipoteses.length, 1);
  assert.equal(s2.ler().hipoteses[0].incremento, 'inc_semente01');
});

test('monco: criar incremento a partir do Veredicto fica desligado', async () => {
  const { store } = falso();
  await store.abrir();
  const r = Core.guardarHipotese(store.ler(), Object.assign({}, HIP, { incrementoNome: 'Incremento novo' }), { criarIncremento: false });
  assert.equal(r.ok, false);
  assert.match(r.erro, /os incrementos criam-se no Taskboards/);
  // o modo local continua a criar
  assert.ok(Core.guardarHipotese(Core.vazio(), Object.assign({}, HIP, { incrementoNome: 'Incremento novo' })).ok);
});

test('monco: várias escritas seguidas dão uma só gravação (debounce)', async () => {
  const { store, db } = falso();
  await store.abrir();
  let d = store.ler();
  for (let i = 0; i < 3; i++) { d = Core.guardarHipotese(d, Object.assign({}, HIP, { aposta: 'aposta ' + i }), { criarIncremento: false }).doc; store.escrever(d); }
  await store.gravarJa();
  assert.equal(db.chamadas.filter((c) => c.caminho === '/rest/v1/rpc/gravar_fatia').length, 1);
  assert.equal(db.fatias.veredicto.dados.hipoteses.length, 3);
});

test('monco: conflito → aviso com quem gravou, nunca grava por cima sozinho; o humano escolhe', async () => {
  const { store, db } = falso();
  await store.abrir();
  // outra pessoa grava entretanto
  db.fatias.veredicto = { app: 'veredicto', versao: 2, por: ANA, em: '2026-11-12T10:05:00Z', dados: { app: 'veredicto', versao: 1, hipoteses: [{ id: 'hip_daana001', aposta: 'a da Ana', metrica: { indicador: 'x', alvo: 'y' } }], decisoes: [] } };
  store.escrever(Core.guardarHipotese(store.ler(), HIP, { criarIncremento: false }).doc);
  await store.gravarJa();
  await new Promise((r) => setImmediate(r));
  const e = store.estado();
  assert.equal(e.fase, 'conflito');
  assert.deepEqual(e.conflito, { versao: 2, por: ANA, em: '2026-11-12T10:05:00Z', nome: 'Ana' });
  assert.equal(db.fatias.veredicto.versao, 2, 'não gravou por cima');
  // gravar de novo sem escolher não grava
  await store.gravarJa();
  assert.equal(db.fatias.veredicto.versao, 2);

  // «gravar por cima» repete com a versão nova
  await store.gravarPorCima();
  assert.equal(db.fatias.veredicto.versao, 3);
  assert.equal(db.fatias.veredicto.dados.hipoteses[0].aposta, HIP.aposta);
  assert.equal(store.estado().fase, 'gravado');
});

test('monco: conflito → «usar a versão deles» descarta o local', async () => {
  const { store, db } = falso();
  await store.abrir();
  db.fatias.veredicto = Object.assign({}, db.fatias.veredicto, { versao: 5, dados: { app: 'veredicto', versao: 1, hipoteses: [{ id: 'hip_daana001', aposta: 'a da Ana', incremento: 'inc_semente01' }], decisoes: [] } });
  store.escrever(Core.guardarHipotese(store.ler(), HIP, { criarIncremento: false }).doc);
  await store.gravarJa();
  const doc = store.usarDeles();
  assert.deepEqual(doc.hipoteses.map((h) => h.aposta), ['a da Ana']);
  assert.equal(store.estado().versao, 5);
  assert.equal(store.estado().fase, 'gravado');
  assert.equal(store.porGravar(), false);
});

test('monco: leitor (ou editor sem veredicto em apps) não escreve — a UI-modelo recusa antes da RPC', async () => {
  for (const membro of [{ acesso: 'leitor' }, { acesso: 'editor', apps: ['casca', 'taskboards'] }]) {
    const { store, db } = falso({ membro });
    const info = await store.abrir();
    assert.equal(info.podeEscrever, false, JSON.stringify(membro));
    assert.equal(store.escrever(Core.guardarHipotese(store.ler(), HIP, { criarIncremento: false }).doc), false);
    await store.gravarJa();
    assert.equal(db.chamadas.filter((c) => c.caminho === '/rest/v1/rpc/gravar_fatia').length, 0);
    assert.equal(store.ler().hipoteses.length, 0);
  }
});

test('monco: incremento apagado no Taskboards → «ligação perdida», sem crash, e a ligação não se perde ao gravar', async () => {
  const veredicto = { app: 'veredicto', versao: 1, hipoteses: [
    { id: 'hip_ligada01', aposta: 'ligada', incremento: 'inc_apagado01', metrica: { indicador: 'a', alvo: 'b' } },
    { id: 'hip_solta001', aposta: 'solta', incremento: null }
  ], decisoes: [{ id: 'dec_antiga01', incremento: 'inc_apagado01', decisao: 'ajustar', porque: 'porque sim', data: '2026-11-01' }] };
  const { store, db } = falso({ veredicto });
  await store.abrir();
  const d = store.ler();
  const h = Core.hipotese(d, 'hip_ligada01');
  assert.equal(h.incremento, 'inc_apagado01');
  assert.equal(Core.ligacaoPerdida(d, h), true);
  assert.equal(Core.ligacaoPerdida(d, Core.hipotese(d, 'hip_solta001')), false);
  assert.equal(d.decisoes.length, 1);
  assert.doesNotThrow(() => Core.exportarMarkdown(d));
  assert.doesNotThrow(() => Core.sugerir(Core.doIncremento(d, 'inc_apagado01')));
  // gravar outra coisa preserva a ligação (se o incremento voltar, volta a ligar)
  store.escrever(Core.mudarEstado(d, 'hip_solta001', 'sustentada').doc);
  await store.gravarJa();
  assert.equal(db.fatias.veredicto.dados.hipoteses[0].incremento, 'inc_apagado01');
  // ids de incremento estranhos vindos da base são descartados
  const lixo = Core.limpar({ hipoteses: [{ aposta: 'x', incremento: '<script>' }] }, { incrementos: [{ id: 'a b', nome: 'mau' }, { id: 'inc_ok0001', nome: '' }] });
  assert.deepEqual(lixo.incrementos, []);
  assert.equal(lixo.hipoteses[0].incremento, null);
});

test('monco: nada da base entra sem Core.limpar (fatia veredicto e boards malformadas)', async () => {
  const { store } = falso({
    veredicto: { hipoteses: [{ aposta: 'a'.repeat(900), estado: 'hackeada', sessoes: 'x' }, null, 7], decisoes: 'nada', incrementos: [{ id: 'inc_intruso1', nome: 'não devia entrar' }] },
    taskboards: { boards: [null, { id: 'inc_a00001', name: 'A', tipo: 'incremento' }, { id: 'inc_a00001', name: 'duplicado', tipo: 'incremento' }, { id: 'inc_b00001', tipo: 'incremento' }] }
  });
  await store.abrir();
  const d = store.ler();
  assert.deepEqual(d.incrementos, [{ id: 'inc_a00001', nome: 'A' }]);
  assert.equal(d.hipoteses.length, 1);
  assert.equal(d.hipoteses[0].aposta.length, 500);
  assert.equal(d.hipoteses[0].estado, 'aberta');
  assert.deepEqual(d.decisoes, []);
});

test('monco: projecto inexistente ou sem acesso → erro claro', async () => {
  const { store } = falso({ semProjecto: true });
  await assert.rejects(store.abrir(), (e) => e.codigo === 'sem-acesso');
});

test('monco: ao voltar ao separador, versão nova sem alterações locais é adoptada e avisada', async () => {
  const { store, db } = falso();
  await store.abrir();
  const avisos = [];
  store.aoMudar((doc, info) => avisos.push({ n: doc.hipoteses.length, info }));
  db.fatias.veredicto = Object.assign({}, db.fatias.veredicto, { versao: 4, por: ANA, dados: { app: 'veredicto', versao: 1, hipoteses: [{ aposta: 'nova' }], decisoes: [] } });
  await store.reler();
  assert.deepEqual(avisos, [{ n: 1, info: { versao: 4, nome: 'Ana' } }]);
  assert.equal(store.estado().versao, 4);
});

test('server: /config.js com o Supabase e a Casca por env, e a CSP deixa ligar a esse URL', async () => {
  const s = await new Promise((ok) => {
    const srv = createApp({ supabaseUrl: 'http://127.0.0.1:54399/', supabaseKey: 'falsa', cascaUrl: 'http://127.0.0.1:5182' }).listen(0, () => ok(srv));
  });
  try {
    const base = 'http://127.0.0.1:' + s.address().port;
    const r = await fetch(base + '/config.js');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.equal(await r.text(), 'window.MONCO_CONFIG = {"supabaseUrl":"http://127.0.0.1:54399","supabaseKey":"falsa","cascaUrl":"http://127.0.0.1:5182"};\n');
    const csp = (await fetch(base + '/')).headers.get('content-security-policy');
    assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:54399;/);
    assert.doesNotMatch(csp, /unsafe-inline/);
    for (const f of ['/js/supa.js', '/js/store.js']) assert.equal((await fetch(base + f)).status, 200, f);
  } finally { s.close(); }
  // omissão: o projecto monco real e a Casca em produção
  const cfg = await new Promise((ok) => {
    const srv = createApp().listen(0, async () => { const t = await (await fetch('http://127.0.0.1:' + srv.address().port + '/config.js')).text(); srv.close(); ok(t); });
  });
  assert.match(cfg, /"supabaseUrl":"https:\/\/[a-z]+\.supabase\.co","supabaseKey":"sb_publishable_[^"]+","cascaUrl":"https:\/\/nimble\.monco\.io"/);
  assert.doesNotMatch(cfg, /service_role|sb_secret/);
});
