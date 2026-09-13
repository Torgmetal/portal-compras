import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma as db } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: db, prismaDirect: db }));
vi.mock("@/lib/gantt-prontidao-servidor", () => ({
  conferirEntradaMontagem: vi.fn(),
  lerProntidaoGantt: vi.fn(),
}));
vi.mock("@/lib/fora-da-fabrica", () => ({
  pecasNoTerceiro: vi.fn(async () => new Set()),
}));
vi.mock("@/lib/produzido-setor", () => ({ lerProduzidoPorSetor: vi.fn() }));
import { aplicarRemanejo } from "@/lib/gantt-pcp";
import { lerProduzidoPorSetor } from "@/lib/produzido-setor";
const p = {
  id: "p",
  opId: "op",
  marca: "M",
  qte: 10,
  tipoPeca: "CONJUNTO",
  montagemDiaProgramado: new Date("2026-09-10"),
  montagemBancada: "MONTAGEM 1",
};
const bloco = {
  setor: "MONTAGEM",
  ids: ["p"],
  dia: "2026-09-12",
  recurso: "MONTAGEM 2",
  fracoes: [
    {
      id: "p",
      inicio: 3,
      quantidade: 7,
      qTotal: 10,
      diaOrigem: "2026-09-10",
      recursoOrigem: "MONTAGEM 1",
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  db.pecaConjunto.findMany.mockResolvedValue([p]);
  db.ganttDistribuicao.findMany.mockResolvedValue([]);
  db.pecaConjunto.updateMany.mockResolvedValue({ count: 1 });
  lerProduzidoPorSetor.mockResolvedValue(() => 3);
});
it("lê produção com o mesmo cliente transacional e preserva unidades concluídas", async () => {
  await aplicarRemanejo([bloco], { id: "u" }, { somenteSaldo: true });
  expect(lerProduzidoPorSetor).toHaveBeenCalledWith([p], undefined, {
    banco: db,
  });
  expect(db.ganttDistribuicao.upsert.mock.calls[0][0].create.partes).toEqual([
    { inicio: 0, quantidade: 3, dia: "2026-09-10", recurso: "MONTAGEM 1" },
    { inicio: 3, quantidade: 7, dia: "2026-09-12", recurso: "MONTAGEM 2" },
  ]);
  expect(db.auditLog.create).toHaveBeenCalledTimes(1);
});
it("novo apontamento impede qualquer escrita", async () => {
  lerProduzidoPorSetor.mockResolvedValue(() => 4);
  await expect(
    aplicarRemanejo([bloco], { id: "u" }, { somenteSaldo: true }),
  ).rejects.toThrow(/produzidas/);
  expect(db.pecaConjunto.updateMany).not.toHaveBeenCalled();
});
