// Avanço do cronograma medido pela LISTA DE PEÇAS DA FASE (OP-105, Vitor 20/09/2026): a mesma marca
// repartida entre duas TAGs, o croqui seguindo o conjunto, e a regra "o produzido preenche as fases
// na ordem de entrega". Ver lib/cronograma-lotes.js.
import { expect, it } from "vitest";
import { avancoPorLote, chaveNomeLote } from "@/lib/cronograma-lotes";
import { avancosDasTarefas } from "@/lib/cronograma-syneco";

const d = (s) => new Date(s + "T12:00:00Z");

// LPC: um conjunto de 34 (17 por TAG) com um croqui de 2 por unidade — `qtdNoConjunto` é o TOTAL no
// conjunto (68 = 2 × 34), como a LPC grava; uma avulsa de 10
const pecas = [
  { marca: "105A14", tipoPeca: "CONJUNTO", qte: 34, pesoTotalKg: 3400, croquis: [{ marca: "105A-P34", qtdNoConjunto: 68 }] },
  { marca: "105A-P34", tipoPeca: "CROQUI", qte: 68, pesoTotalKg: 680 },
  { marca: "105A3", tipoPeca: null, qte: 10, pesoTotalKg: 100 },
];
const lotes = [
  { id: "l4706", nome: "Treliças TC 4706 (A)", ordem: 1, pecas: [{ marca: "105A14", qtd: 17 }, { marca: "105A3", qtd: 5 }] },
  { id: "l4707", nome: "Treliças TC 4707 (A)", ordem: 2, pecas: [{ marca: "105A14", qtd: 17 }, { marca: "105A3", qtd: 5 }] },
  { id: "vazio", nome: "Romaneio 01", ordem: 3, pecas: [] },
];

it("marca repartida: o produzido preenche a fase de menor ordem primeiro", () => {
  const r = avancoPorLote({ lotes, pecas, apontamentos: [
    { marca: "105A14", setor: "MONTAGEM", un: 20, kg: 2000, data: d("2026-09-10") },
  ] });
  expect([...r.keys()]).toEqual(["l4706", "l4707"]); // lote sem lista fica de fora
  const a = r.get("l4706").porSetor.MONTAGEM, b = r.get("l4707").porSetor.MONTAGEM;
  expect(a).toMatchObject({ escopoKg: 1700, produzidoKg: 1700, realizado: 100 });
  expect(b).toMatchObject({ escopoKg: 1700, produzidoKg: 300, realizado: 17.6 });
  expect(a.dataInicioReal).toEqual(d("2026-09-10"));
});

it("croqui segue o conjunto: o corte da fase é o das sub-peças dela, mais as avulsas", () => {
  const r = avancoPorLote({ lotes, pecas, apontamentos: [
    { marca: "105A-P34", setor: "CORTE", un: 40, kg: 400, data: d("2026-09-01") },
    { marca: "105A3", setor: "CORTE", un: 10, kg: 100, data: d("2026-09-02") },
  ] });
  const a = r.get("l4706").porSetor.CORTE, b = r.get("l4707").porSetor.CORTE;
  // escopo de corte da 4706: 17 conjuntos × (68 ÷ 34 = 2) croquis × 10 kg + 5 avulsas × 10 kg = 390 kg
  expect(a.escopoKg).toBe(390);
  // 40 croquis cortados: 34 cabem na 4706, 6 vão para a 4707; avulsas 5 + 5
  expect(a.produzidoKg).toBe(340 + 50);
  expect(b.produzidoKg).toBe(60 + 50);
  expect(a.realizado).toBe(100);
  expect(b.realizado).toBe(28.2);
  // o histórico repartido soma o mesmo que o produzido
  expect(a.baixas.reduce((s, x) => s + x.kg, 0)).toBe(a.produzidoKg);
  expect(b.baixas.reduce((s, x) => s + x.kg, 0)).toBe(b.produzidoKg);
});

it("a lista não pode pedir mais do que a LPC tem, e produção reapontada não passa de 100%", () => {
  const r = avancoPorLote({
    lotes: [{ id: "x", nome: "Fase X", ordem: 1, pecas: [{ marca: "105A3", qtd: 50 }, { marca: "NAO-EXISTE", qtd: 3 }] }],
    pecas, apontamentos: [{ marca: "105A3", setor: "CORTE", un: 25, kg: 250, data: null }],
  });
  const x = r.get("x");
  expect(x.semLpc).toEqual(["NAO-EXISTE"]);
  expect(x.porSetor.CORTE).toMatchObject({ escopoKg: 100, produzidoKg: 100, realizado: 100 });
  expect(x.porSetor.MONTAGEM).toBeUndefined(); // avulsa não tem escopo de montagem
});

it("nome de lote compara sem acento, caixa e espaço duplicado", () => {
  expect(chaveNomeLote("  Treliças  TC 4706 (A) ")).toBe(chaveNomeLote("trelicas tc 4706 (a)"));
});

it("no cronograma, duas áreas (A) com listas diferentes não disputam a mesma frente", () => {
  const r = avancoPorLote({ lotes, pecas, apontamentos: [{ marca: "105A14", setor: "MONTAGEM", un: 20, kg: 2000, data: null }] });
  const porLote = new Map([...r.values()].map((x) => [chaveNomeLote(x.nome), x]));
  const sync = { porFrenteFase: new Map([["A|MONTAGEM", { escopoKg: 3400, produzidoKg: 2000, realizado: 58.8, dataInicioReal: null, baixas: [] }]]), porLote };
  const tarefas = [
    { id: "m1", nome: "Montagem", departamento: "FABRICACAO", area: "Treliças TC 4706 (A)" },
    { id: "m2", nome: "Montagem - TC4707", departamento: "FABRICACAO", area: "Treliças TC 4707 (A)" },
    // área que NÃO é uma fase com lista continua pela letra
    { id: "m3", nome: "Montagem", departamento: "FABRICACAO", area: "Outra coisa (A)" },
  ];
  const av = avancosDasTarefas(tarefas, sync);
  expect(av.get("m1")).toMatchObject({ realizado: 100, lote: "Treliças TC 4706 (A)" });
  expect(av.get("m2")).toMatchObject({ realizado: 17.6, lote: "Treliças TC 4707 (A)" });
  expect(av.get("m3")).toMatchObject({ realizado: 58.8 });
  expect(av.get("m1").ambigua).toBeUndefined();
});
