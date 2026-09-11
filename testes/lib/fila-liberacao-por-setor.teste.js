import { describe, it, expect } from "vitest";
import { CASCATA_FILA, SETORES_COM_FILA } from "@/lib/fila-setor";

/* Vitor (09/09/2026): "isso só está valendo para montagem e preparação; para os demais setores, se
   quiser me trazer aqui quais obras estão em aberto para podermos programar, pode trazer".

   A regra de 08/09 — "na tela do Gantt só pode aparecer as peças que o Gabriel programou" — vale
   para PREPARAÇÃO e MONTAGEM, que são o que o Planejamento desce. Da solda em diante quem programa
   é o PCP, e esperar liberação ali é esperar por algo que não vem. */
describe("a fila do quadro cobre da solda em diante", () => {
  it("solda, acabamento, jato e pintura têm fila; preparação e montagem não", () => {
    expect(SETORES_COM_FILA.sort()).toEqual(["ACABAMENTO", "JATO", "PINTURA", "SOLDA"]);
    expect(SETORES_COM_FILA).not.toContain("CORTE");
    expect(SETORES_COM_FILA).not.toContain("MONTAGEM");
  });

  it("cada setor se alimenta do anterior na rota", () => {
    expect(CASCATA_FILA).toEqual({
      SOLDA: "MONTAGEM", ACABAMENTO: "SOLDA", JATO: "ACABAMENTO", PINTURA: "JATO",
    });
  });

  it("a cascata não tem ciclo e nenhum setor se alimenta de si mesmo", () => {
    for (const [setor, anterior] of Object.entries(CASCATA_FILA)) {
      expect(anterior).not.toBe(setor);
      // o anterior de um setor da fila nunca pode ser um setor que vem depois dele
      const ordem = ["CORTE", "PREPARACAO", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
      expect(ordem.indexOf(anterior)).toBeLessThan(ordem.indexOf(setor));
    }
  });
});
