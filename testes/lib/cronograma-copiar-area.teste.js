// Copiar uma área do cronograma para outras (Vitor, 09/10/2026, OP-118): "selecionar a área criada com
// todas as informações e datas já criadas (…) e posteriormente fazer as vinculações. As áreas já foram
// criadas." Na Fabricação da OP-118 só a área A tinha tarefas; B, C, D, F e "Romaneio 01" estavam vazias.
import { describe, it, expect } from "vitest";
import { planoCopiaArea } from "@/lib/cronograma-copiar-area";

const d = (s) => new Date(`${s}T00:00:00Z`);
const T = (id, uid, nome, extra = {}) => ({
  id, uidMpp: uid, nome, departamento: "FABRICACAO", area: "A", isSummary: false, outlineLevel: 2, parentUid: null,
  dataInicioPrevista: d("2026-09-22"), dataFimPrevista: d("2026-12-01"), percentualPrevisto: 10, duracaoDias: 50,
  defasagemDias: -50, observacao: null, responsavelId: "u1", qtdePlanejada: 0, antecessoraIds: [],
  percentualRealizado: 62, qtdeRealizada: 0, avancoManual: true, dataInicioReal: d("2026-09-22"), dataFimReal: null,
  dataInicioBase: null, dataFimBase: null, motivoBloqueio: null, ...extra,
});
const TAREFAS = [
  { id: "sup", uidMpp: 10, nome: "Recebimento de matéria-prima (aço)", departamento: "SUPRIMENTOS", area: null, isSummary: false, antecessoraIds: [] },
  { id: "fab", uidMpp: 17, nome: "Fabricação", departamento: "FABRICACAO", area: null, isSummary: true, antecessoraIds: [] },
  T("prep", 18, "Preparação", { antecessoraIds: ["sup"] }),
  T("mont", 19, "Montagem", { antecessoraIds: ["prep"], defasagemDias: -37, percentualRealizado: 18.3 }),
  T("solda", 20, "Solda", { antecessoraIds: ["mont"], defasagemDias: -48, percentualRealizado: 0, avancoManual: false }),
  T("pint", 21, "Pintura", { antecessoraIds: ["solda"], defasagemDias: -48, percentualRealizado: 0, avancoManual: false }),
  { id: "exp", uidMpp: 23, nome: "Expedição", departamento: "EXPEDICAO", area: null, isSummary: false, antecessoraIds: ["pint"] },
];
let n = 0;
const novoId = () => `novo-${++n}`;
const plano = (extra = {}) => { n = 0; return planoCopiaArea({ tarefas: TAREFAS, origem: "A", departamento: "FABRICACAO", destinos: ["B", "C"], novoId, ...extra }); };

describe("copiar a área A da Fabricação", () => {
  it("cada área de destino recebe as tarefas da origem, na mesma ordem, com nomes, datas e durações", () => {
    const { criar, porDestino } = plano();
    expect(porDestino).toEqual({ B: 4, C: 4 });
    expect(criar.filter((t) => t.area === "B").map((t) => t.nome)).toEqual(["Preparação", "Montagem", "Solda", "Pintura"]);
    const prepB = criar.find((t) => t.area === "B" && t.nome === "Preparação");
    expect(prepB).toMatchObject({ departamento: "FABRICACAO", outlineLevel: 2, duracaoDias: 50, defasagemDias: -50, percentualPrevisto: 10, responsavelId: "u1", isSummary: false });
    expect(prepB.dataInicioPrevista).toEqual(d("2026-09-22"));
    expect(prepB.dataFimPrevista).toEqual(d("2026-12-01"));
  });

  it("o encadeamento DENTRO da área aponta para as cópias, não para a área A", () => {
    const { criar } = plano();
    const de = (area, nome) => criar.find((t) => t.area === area && t.nome === nome);
    expect(de("B", "Montagem").antecessoraIds).toEqual([de("B", "Preparação").id]);
    expect(de("C", "Pintura").antecessoraIds).toEqual([de("C", "Solda").id]);
  });

  it("os vínculos com tarefas de fora da área ficam (ou saem, se pedido)", () => {
    expect(plano().criar.find((t) => t.area === "B" && t.nome === "Preparação").antecessoraIds).toEqual(["sup"]);
    expect(plano({ manterExternas: false }).criar.find((t) => t.area === "B" && t.nome === "Preparação").antecessoraIds).toEqual([]);
  });

  it("o avanço NÃO é copiado: a área nova ainda não começou", () => {
    const prepB = plano().criar.find((t) => t.area === "B" && t.nome === "Preparação");
    expect(prepB).toMatchObject({ percentualRealizado: 0, qtdeRealizada: 0, avancoManual: false, dataInicioReal: null, dataFimReal: null, motivoBloqueio: null });
  });

  it("a quantidade planejada não vai junto (é da área de origem)", () => {
    const { criar } = planoCopiaArea({ tarefas: TAREFAS.map((t) => (t.id === "prep" ? { ...t, qtdePlanejada: 41000 } : t)), origem: "A", departamento: "FABRICACAO", destinos: ["B"], novoId });
    expect(criar[0].qtdePlanejada).toBe(0);
  });

  it("os números (uid) continuam depois do maior que existe, sem repetir", () => {
    const uids = plano().criar.map((t) => t.uidMpp);
    expect(uids).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
  });

  it("a área de destino guarda o nome como foi escrito no cadastro", () => {
    const { criar } = plano({ destinos: ["Romaneio 01"] });
    expect(criar.every((t) => t.area === "Romaneio 01")).toBe(true);
  });
});

describe("o que é recusado", () => {
  it("área de origem sem tarefas no setor", () => {
    expect(plano({ origem: "Z" }).erro).toMatch(/não tem tarefas/);
  });
  it("destino igual à origem", () => {
    expect(plano({ destinos: ["a"] }).erro).toMatch(/mesma área/);
  });
  it("destino que já tem tarefas no setor (não duplica por engano)", () => {
    const tarefas = [...TAREFAS, { ...T("x", 40, "Preparação"), area: "B" }];
    const r = planoCopiaArea({ tarefas, origem: "A", departamento: "FABRICACAO", destinos: ["B", "C"], novoId });
    expect(r.erro).toMatch(/B já tem tarefas/);
  });
  it("nenhum destino", () => {
    expect(plano({ destinos: [] }).erro).toMatch(/Escolha/);
  });
});
