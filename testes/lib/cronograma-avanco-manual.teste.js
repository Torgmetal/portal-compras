// O percentual digitado à mão prevalece sobre os sincronismos. Vitor (14/09/2026), OP-094: o Guilherme
// pôs Recebimento em 100 %, o sync do CMR devolveu 84 % — "não precisa atualizar, deixa como o Guilherme fez".
import { beforeEach, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { avancosDasTarefas } from "@/lib/cronograma-syneco";
import { aplicarAvancoSuprimentos } from "@/lib/cronograma-suprimentos";

it("Fabricação: tarefa com avancoManual fica fora do avanço do Syneco", () => {
  const sync = { porFrenteFase: new Map([["*|CORTE", { escopoKg: 100, produzidoKg: 33, realizado: 33, dataInicioReal: null, baixas: [] }]]) };
  const tarefas = [{ id: "a", nome: "Preparação", departamento: "FABRICACAO", area: null, avancoManual: false }, { id: "b", nome: "Preparação (B)", departamento: "FABRICACAO", area: "B", avancoManual: true }];
  const av = avancosDasTarefas(tarefas, sync);
  expect(av.get("a")?.realizado).toBe(33);
  expect(av.has("b")).toBe(false);
});

it("Suprimentos: linha manual não é sobrescrita pelo CMR", async () => {
  vi.clearAllMocks();
  mockPrisma.cronograma.findFirst.mockResolvedValue({ id: "c1", titulo: "X", createdAt: new Date("2026-08-01") });
  mockPrisma.cronogramaTarefa.findMany.mockResolvedValue([
    { id: "t1", nome: "Recebimento da Matéria prima", qtdePlanejada: 0, percentualRealizado: 100, dataInicioReal: null, dataFimReal: null, avancoManual: true },
  ]);
  mockPrisma.rMItem.findMany.mockResolvedValue([]);
  mockPrisma.rM.findFirst?.mockResolvedValue?.(null);
  const r = await aplicarAvancoSuprimentos(mockPrisma, "op94");
  expect(mockPrisma.cronogramaTarefa.update).not.toHaveBeenCalled();
  expect(r.linhas).toEqual([{ nome: "Recebimento da Matéria prima", pct: 100, manual: true }]);
});
