// A rota que copia uma área do cronograma para outras (POST /[id]/areas, acao "copiar") — OP-118, 09/10/2026.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u1", name: "Vitor" }) }));
import { POST } from "@/app/api/planejamento/cronogramas/[id]/areas/route";

const d = (s) => new Date(`${s}T00:00:00Z`);
const T = (id, uid, nome, ants = []) => ({ id, uidMpp: uid, nome, departamento: "FABRICACAO", area: "A", isSummary: false, outlineLevel: 2, parentUid: null, dataInicioPrevista: d("2026-09-22"), dataFimPrevista: d("2026-12-01"), percentualPrevisto: 0, duracaoDias: 50, defasagemDias: -50, observacao: null, responsavelId: null, antecessoraIds: ants });
const TAREFAS = [
  { id: "sup", uidMpp: 10, nome: "Recebimento de aço", departamento: "SUPRIMENTOS", area: null, isSummary: false, antecessoraIds: [] },
  T("prep", 18, "Preparação", ["sup"]), T("mont", 19, "Montagem", ["prep"]),
];
const req = (b) => new Request("http://localhost", { method: "POST", body: JSON.stringify(b) });
const params = { params: Promise.resolve({ id: "c118" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cronograma.findUnique.mockResolvedValue({ id: "c118", areas: [{ nome: "A", cor: 0 }, { nome: "B", cor: 2 }, { nome: "C", cor: 3 }] });
  mockPrisma.cronogramaTarefa.findMany.mockResolvedValue(TAREFAS);
  mockPrisma.cronogramaTarefa.createMany.mockResolvedValue({ count: 4 });
  mockPrisma.cronograma.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("copiar área", () => {
  it("cria as cópias numa gravação só e devolve quantas foram para cada área", async () => {
    const res = await POST(req({ acao: "copiar", origem: "A", departamento: "FABRICACAO", destinos: ["B", "C"] }), params);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.porDestino).toEqual({ B: 2, C: 2 });
    const { data } = mockPrisma.cronogramaTarefa.createMany.mock.calls[0][0];
    expect(data).toHaveLength(4);
    expect(data.every((t) => t.cronogramaId === "c118")).toBe(true);
    const montB = data.find((t) => t.area === "B" && t.nome === "Montagem");
    const prepB = data.find((t) => t.area === "B" && t.nome === "Preparação");
    expect(montB.antecessoraIds).toEqual([prepB.id]);
    expect(prepB.antecessoraIds).toEqual(["sup"]);
  });

  it("registra na auditoria de onde para onde", async () => {
    await POST(req({ acao: "copiar", origem: "A", departamento: "FABRICACAO", destinos: ["B"] }), params);
    const audit = mockPrisma.auditLog.create.mock.calls.at(-1)[0].data;
    expect(audit).toMatchObject({ userId: "u1", action: "COPIAR_AREA_CRONOGRAMA", entity: "Cronograma", entityId: "c118" });
    expect(audit.diff).toMatchObject({ origem: "A", departamento: "FABRICACAO", destinos: ["B"], tarefas: 2, manterExternas: true });
  });

  it("sem os vínculos de fora, a Preparação nasce sem antecessora", async () => {
    await POST(req({ acao: "copiar", origem: "A", departamento: "FABRICACAO", destinos: ["B"], manterExternas: false }), params);
    const { data } = mockPrisma.cronogramaTarefa.createMany.mock.calls[0][0];
    expect(data.find((t) => t.nome === "Preparação").antecessoraIds).toEqual([]);
  });

  it("destino ocupado é recusado com o motivo, e nada é gravado", async () => {
    mockPrisma.cronogramaTarefa.findMany.mockResolvedValue([...TAREFAS, { ...T("x", 30, "Preparação"), area: "B" }]);
    const res = await POST(req({ acao: "copiar", origem: "A", departamento: "FABRICACAO", destinos: ["B"] }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/B já tem tarefas/);
    expect(mockPrisma.cronogramaTarefa.createMany).not.toHaveBeenCalled();
  });

  it("setor inválido é recusado", async () => {
    const res = await POST(req({ acao: "copiar", origem: "A", departamento: "XPTO", destinos: ["B"] }), params);
    expect(res.status).toBe(400);
  });

  it("as outras ações continuam como antes (renomear)", async () => {
    mockPrisma.cronogramaTarefa.findMany.mockResolvedValue([{ id: "prep", area: "A" }]);
    const res = await POST(req({ acao: "renomear", de: "A", para: "A1" }), params);
    expect(res.status).toBe(200);
  });
});
