// Corte e montagem (Matheus, 15/10/2026): a lista das obras "está demorando muito para carregar".
// Ela vinha da rota do PCP, que monta kg/setores/atraso de todas as obras só para encher um seletor.
// A lista enxuta escolhe as MESMAS obras (obrasCandidatas + LPC + não encerrada + liberada pelo
// Planejamento) e devolve só o que o seletor mostra.
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { listaDeObrasDaProducao } from "@/lib/prioridades-setor-data";

const op = (id, numero, extra = {}) => ({ id, numero, obra: `Obra ${numero}`, cliente: `Cli ${numero}`, refCliente: null, emProducao: true, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cronograma.findMany.mockResolvedValue([]);
  mockPrisma.prioridadeTvOp.findMany.mockResolvedValue([]);
  mockPrisma.mesOrdem.groupBy.mockResolvedValue([]);
  // enviadas para produção: 105, 097 (sem LPC) e 078 (encerrada) e 112 (sem liberação)
  mockPrisma.oP.findMany.mockImplementation(async ({ where }) => {
    if (where?.emProducao) return [op("a", "105"), op("b", "097"), op("c", "078"), op("d", "112"), op("e", "089")];
    if (where?.status) return [{ id: "c" }]; // as encerradas
    return [];
  });
  mockPrisma.pecaConjunto.groupBy.mockResolvedValue([{ opId: "a" }, { opId: "c" }, { opId: "d" }, { opId: "e" }]);
  mockPrisma.liberacaoProducao.findMany.mockResolvedValue([
    { opId: "e", dataProgramada: new Date("2026-10-16"), prioridade: "MEDIA" },
    { opId: "a", dataProgramada: new Date("2026-10-15"), prioridade: "BAIXA" },
    { opId: "c", dataProgramada: new Date("2026-10-10"), prioridade: "ALTA" },
  ]);
});

it("só as obras com lista (LPC), vivas e liberadas — na ordem do dia programado", async () => {
  const ops = await listaDeObrasDaProducao();
  expect(ops).toEqual([
    { opId: "a", opNumero: "105", cliente: "Cli 105", obra: "Obra 105" },
    { opId: "e", opNumero: "089", cliente: "Cli 089", obra: "Obra 089" },
  ]);
});

it("não carrega peça nenhuma — é isso que a deixa rápida", async () => {
  await listaDeObrasDaProducao();
  expect(mockPrisma.pecaConjunto.findMany).not.toHaveBeenCalled();
});

it("`todas` dispensa a liberação, mas não traz de volta a encerrada nem a sem lista", async () => {
  const ops = await listaDeObrasDaProducao({ todas: true });
  expect(ops.map((o) => o.opNumero).sort()).toEqual(["089", "105", "112"]);
});
