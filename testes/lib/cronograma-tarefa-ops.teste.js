import { describe, it, expect } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
import { montarOperacoesDoPatch } from "@/lib/cronograma-tarefa-ops";

const BASE = {
  id: "tX", data: { percentualRealizado: 80 }, diffAntes: {}, diffDepois: {},
  tarefa: { nome: "Montagem", percentualRealizado: 40, observacao: null, cronograma: { id: "c1", dataBase: null } },
  userId: "u1", justificativa: undefined,
};

describe("montarOperacoesDoPatch", () => {
  it("sempre grava a tarefa E o AuditLog, na mesma transação", () => {
    const ops = montarOperacoesDoPatch(mockPrisma, BASE);
    expect(ops).toHaveLength(2);
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("justificativa vira um registro na tarefa", () => {
    const ops = montarOperacoesDoPatch(mockPrisma, { ...BASE, justificativa: "cliente segurou" });
    expect(ops).toHaveLength(3);
  });

  // ⚠ sem baseline não há revisão: o cronograma ainda é rascunho.
  it("sem dataBase, nenhuma revisão é gerada nem com datas mudando", () => {
    const ops = montarOperacoesDoPatch(mockPrisma, {
      ...BASE, diffDepois: { dataFimPrevista: "2026-03-10" }, diffAntes: { dataFimPrevista: null },
    });
    expect(ops).toHaveLength(2);
  });

  it("com baseline e data mudando, a revisão sai como DATA_ALTERADA", () => {
    const tarefa = { ...BASE.tarefa, cronograma: { id: "c1", dataBase: new Date("2026-01-01") } };
    montarOperacoesDoPatch(mockPrisma, {
      ...BASE, tarefa, diffDepois: { dataFimPrevista: "2026-03-10" }, diffAntes: { dataFimPrevista: null },
    });
    const arg = mockPrisma.cronogramaRevisao.create.mock.calls.at(-1)[0];
    expect(arg.data.tipo).toBe("DATA_ALTERADA");
  });

  it("com baseline e só progresso mudando, sai como TAREFA_ALTERADA", () => {
    const tarefa = { ...BASE.tarefa, cronograma: { id: "c1", dataBase: new Date("2026-01-01") } };
    montarOperacoesDoPatch(mockPrisma, {
      ...BASE, tarefa, diffAntes: { percentualRealizado: 40 }, diffDepois: { percentualRealizado: 80 },
    });
    const arg = mockPrisma.cronogramaRevisao.create.mock.calls.at(-1)[0];
    expect(arg.data.tipo).toBe("TAREFA_ALTERADA");
    expect(arg.data.descricao).toContain("progresso 40% → 80%");
  });

  it("com baseline mas mudança que não rende frase, não gera revisão", () => {
    const tarefa = { ...BASE.tarefa, cronograma: { id: "c1", dataBase: new Date("2026-01-01") } };
    const ops = montarOperacoesDoPatch(mockPrisma, { ...BASE, tarefa, diffDepois: { nome: "Outro" } });
    expect(ops).toHaveLength(2);
  });
});
