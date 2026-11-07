'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../public/js/core.js');

const METRICA = { indicador: 'tempo até ao primeiro roadmap', alvo: '< 10 min', como: 'cronómetro em 3 sessões' };
function comHipotese(extra) {
  const r = V.guardarHipotese(V.vazio(), Object.assign({ aposta: 'se o pitch gerar o roadmap, o arranque fica abaixo de 10 min', metrica: METRICA, incrementoNome: 'Incremento 1' }, extra));
  assert.ok(r.ok, r.erro);
  return r;
}
const sessao = (v, extra) => Object.assign({ data: '2026-11-07', tipo: 'validacao', participantes: '1 utilizador', sinal: 'observado', veredicto: v, accao: { tipo: 'aprender' } }, extra);

test('criar hipótese sem métrica é recusado', () => {
  const r = V.guardarHipotese(V.vazio(), { aposta: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /métrica/);
  assert.equal(V.guardarHipotese(V.vazio(), { aposta: 'x', metrica: { indicador: 'y' } }).ok, false, 'sem alvo também recusa');
});

test('criar hipótese cria o incremento pelo nome e reutiliza-o', () => {
  const r = comHipotese();
  assert.equal(r.doc.incrementos.length, 1);
  const r2 = V.guardarHipotese(r.doc, { aposta: 'outra', metrica: METRICA, incrementoNome: 'incremento 1' });
  assert.equal(r2.doc.incrementos.length, 1);
  assert.equal(r2.doc.hipoteses[1].incremento, r.doc.incrementos[0].id);
  assert.equal(r2.doc.hipoteses[1].estado, 'aberta');
});

test('as funções não mutam o documento recebido', () => {
  const r = comHipotese();
  const antes = JSON.stringify(r.doc);
  V.registarSessao(r.doc, r.id, sessao('sustentada'), { actualizarEstado: true });
  V.mudarEstado(r.doc, r.id, 'refutada');
  assert.equal(JSON.stringify(r.doc), antes);
});

test('sessão insuficiente deixa a hipótese por testar', () => {
  const r = comHipotese();
  const s = V.registarSessao(r.doc, r.id, sessao('insuficiente'), { actualizarEstado: true });
  assert.ok(s.ok);
  const h = V.hipotese(s.doc, r.id);
  assert.equal(h.estado, 'insuficiente');
  assert.ok(V.porTestar(h));
});

test('sessão sem pedir actualização não mexe no estado', () => {
  const r = comHipotese();
  const s = V.registarSessao(r.doc, r.id, sessao('sustentada'));
  assert.equal(V.hipotese(s.doc, r.id).estado, 'aberta');
  assert.equal(V.hipotese(s.doc, r.id).sessoes.length, 1);
});

test('sessão incompleta é recusada', () => {
  const r = comHipotese();
  assert.equal(V.registarSessao(r.doc, r.id, sessao('sustentada', { sinal: '' })).ok, false);
  assert.equal(V.registarSessao(r.doc, r.id, sessao('talvez')).ok, false);
  assert.equal(V.registarSessao(r.doc, r.id, sessao('sustentada', { accao: {} })).ok, false);
  assert.equal(V.registarSessao(r.doc, r.id, sessao('sustentada', { data: '7/11' })).ok, false);
});

test('estados só avançam', () => {
  const r = comHipotese();
  const a = V.mudarEstado(r.doc, r.id, 'insuficiente');
  assert.ok(a.ok);
  assert.equal(V.mudarEstado(a.doc, r.id, 'aberta').ok, false, 'insuficiente → aberta recusado');
  const b = V.mudarEstado(a.doc, r.id, 'sustentada');
  assert.ok(b.ok);
  const c = V.mudarEstado(b.doc, r.id, 'refutada');
  assert.equal(c.ok, false);
  assert.match(c.erro, /re-teste é uma sessão nova/);
});

test('sugestão do incremento', () => {
  let r = comHipotese();
  const inc = r.doc.incrementos[0].id;
  r = V.guardarHipotese(r.doc, { aposta: 'b', metrica: METRICA, incrementoNome: 'Incremento 1' });
  const [h1, h2] = r.doc.hipoteses.map((h) => h.id);
  let d = r.doc;
  assert.equal(V.sugerir(V.doIncremento(d, inc)).sugestao, 'ainda-nao');
  d = V.mudarEstado(d, h1, 'sustentada').doc;
  assert.equal(V.sugerir(V.doIncremento(d, inc)).sugestao, 'ainda-nao');
  const persevera = V.mudarEstado(d, h2, 'sustentada').doc;
  assert.equal(V.sugerir(V.doIncremento(persevera, inc)).sugestao, 'perseverar');
  const ajusta = V.mudarEstado(d, h2, 'refutada').doc;
  assert.equal(V.sugerir(V.doIncremento(ajusta, inc)).sugestao, 'ajustar');
  const mata = V.mudarEstado(V.mudarEstado(r.doc, h1, 'refutada').doc, h2, 'refutada').doc;
  assert.equal(V.sugerir(V.doIncremento(mata, inc)).sugestao, 'matar');
});

test('hipóteses não críticas não pesam quando há críticas', () => {
  let r = comHipotese();
  const inc = r.doc.incrementos[0].id;
  r = V.guardarHipotese(r.doc, { aposta: 'b', metrica: METRICA, incrementoNome: 'Incremento 1', critica: false });
  const d = V.mudarEstado(r.doc, r.doc.hipoteses[0].id, 'sustentada').doc;
  assert.equal(V.sugerir(V.doIncremento(d, inc)).sugestao, 'perseverar');
});

test('decisão exige porquê e alvo válido', () => {
  const r = comHipotese();
  const inc = r.doc.incrementos[0].id;
  assert.equal(V.decidir(r.doc, { incremento: inc }, { decisao: 'ajustar', porque: '' }).ok, false);
  assert.equal(V.decidir(r.doc, { incremento: inc }, { decisao: 'talvez', porque: 'x' }).ok, false);
  assert.equal(V.decidir(r.doc, { hipotese: r.id }, { decisao: 'ajustar', porque: 'x' }).ok, false, 'hipótese de incremento decide-se no incremento');
  const ok = V.decidir(r.doc, { incremento: inc }, { decisao: 'ajustar', porque: 'o alvo ficou longe', data: '2026-11-07' });
  assert.ok(ok.ok);
  assert.deepEqual(ok.doc.decisoes[0].hipoteses, [r.id]);
});

test('hipótese solta (spike) decide-se ao nível da hipótese', () => {
  const r = comHipotese({ incrementoNome: '' });
  assert.equal(r.doc.hipoteses[0].incremento, null);
  const ok = V.decidir(r.doc, { hipotese: r.id }, { decisao: 'matar', porque: 'o hardware não responde' });
  assert.ok(ok.ok);
  assert.equal(ok.doc.decisoes[0].hipotese, r.id);
});

test('apagar hipótese limpa as decisões ligadas', () => {
  const r = comHipotese({ incrementoNome: '' });
  const d = V.decidir(r.doc, { hipotese: r.id }, { decisao: 'matar', porque: 'x' }).doc;
  const a = V.apagarHipotese(d, r.id);
  assert.equal(a.doc.hipoteses.length, 0);
  assert.equal(a.doc.decisoes.length, 0);
});

test('round-trip exportar → importar igual', () => {
  let r = comHipotese();
  let d = V.registarSessao(r.doc, r.id, sessao('sustentada', { medido: '7 min', accao: { tipo: 'ajuste', destino: 'cartão 12' } }), { actualizarEstado: true }).doc;
  d = V.decidir(d, { incremento: d.incrementos[0].id }, { decisao: 'perseverar', porque: 'abaixo do alvo', data: '2026-11-07' }).doc;
  const j = V.exportarJSON(d);
  const i = V.importar(j);
  assert.ok(i.ok, i.erro);
  assert.equal(V.exportarJSON(i.doc), j);
});

test('importar limpa ids repetidos, estados e referências partidas', () => {
  const sujo = JSON.stringify({
    app: 'veredicto', incrementos: [{ id: 'inc_aaaa1111', nome: 'A' }],
    hipoteses: [
      { id: 'hip_aaaa1111', aposta: 'um', estado: 'mágico', incremento: 'inc_naoexiste', sessoes: [{ veredicto: 'sustentada', sinal: 's' }, { veredicto: '???' }] },
      { id: 'hip_aaaa1111', aposta: 'dois' },
      { id: 'hip_semaposta' },
      { id: '<script>', aposta: 'três', metrica: { indicador: 'i', alvo: 'a' } }
    ],
    decisoes: [{ incremento: 'inc_aaaa1111', decisao: 'perseverar', porque: '' }, { hipotese: 'hip_xxx', decisao: 'matar', porque: 'x' }]
  });
  const r = V.importar(sujo);
  assert.ok(r.ok);
  const ids = r.doc.hipoteses.map((h) => h.id);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.every((id) => /^hip_[a-z0-9]+$/.test(id)));
  assert.equal(r.doc.hipoteses[0].estado, 'aberta');
  assert.equal(r.doc.hipoteses[0].incremento, null);
  assert.equal(r.doc.hipoteses[0].sessoes.length, 1);
  assert.equal(r.doc.decisoes.length, 0);
});

test('importar recusa o que não é do Veredicto', () => {
  assert.equal(V.importar('{"app":"roadmaps"}').ok, false);
  assert.equal(V.importar('{oops').ok, false);
  assert.equal(V.importar('olá').ok, false);
  assert.equal(V.importar('').ok, false);
});

test('importar o validacoes.yaml do v0: 4 hipóteses, métricas a completar', () => {
  const yaml = fs.readFileSync(path.join(__dirname, 'fixtures', 'validacoes-v0.yaml'), 'utf8');
  const r = V.importar(yaml);
  assert.ok(r.ok, r.erro);
  const hs = r.doc.hipoteses;
  assert.equal(hs.length, 4);
  assert.deepEqual(hs.map((h) => h.estado), ['sustentada', 'insuficiente', 'aberta', 'aberta']);
  assert.ok(hs.every((h) => !V.metricaCompleta(h.metrica)));
  assert.equal(hs[0].origem, 'HIP-0001 · CON-0001');
  assert.equal(hs[1].sessoes[0].accao.tipo, 'ajuste');
  assert.equal(hs[1].sessoes[0].accao.destino, 'TAR-0002');
  assert.equal(hs[0].aposta, 'com taxonomia fixa, categorizar um tema demora menos de 1 minuto');
});

test('Markdown leva decisões, sinais e métricas', () => {
  let r = comHipotese();
  let d = V.registarSessao(r.doc, r.id, sessao('sustentada', { sinal: 'chegou ao roadmap em 7 min | sem ajuda', medido: '7 min' }), { actualizarEstado: true }).doc;
  d = V.decidir(d, { incremento: d.incrementos[0].id }, { decisao: 'perseverar', porque: 'abaixo do alvo', data: '2026-11-07' }).doc;
  const s = V.guardarHipotese(d, { aposta: 'spike de protocolo', metrica: METRICA }).doc;
  const md = V.exportarMarkdown(s, 'teste');
  assert.match(md, /^# Veredicto — teste/);
  assert.match(md, /## Incremento 1/);
  assert.match(md, /\*\*PERSEVERAR\*\* \(2026-11-07\) — abaixo do alvo/);
  assert.match(md, /chegou ao roadmap em 7 min \\\| sem ajuda/);
  assert.match(md, /alvo < 10 min/);
  assert.match(md, /## Hipóteses sem incremento/);
});
