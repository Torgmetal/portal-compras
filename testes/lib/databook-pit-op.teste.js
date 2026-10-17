import { describe, expect, it } from "vitest";
import { pitDaOpParaDataBook } from "@/lib/databook-pit";

describe("PIT da OP no Data Book", () => {
  it("converte o padrão SNQC escolhido na OP para a tabela da seção 10", () => {
    const pit = pitDaOpParaDataBook("SNQC", "0");

    expect(pit).toMatchObject({ origem: "OP", padrao: "SNQC", revisao: "0" });
    expect(pit.itens).toHaveLength(15);
    expect(pit.itens[0]).toMatchObject({
      etapa: "1 · RECEBIMENTO MATÉRIA PRIMA",
      caracteristica: "Visual / Dimensional; Qualitativa / Quantitativa",
      metodo: "Almoxarife",
      frequencia: "100%",
      registro: "RI / DB / CT",
      criterio: "Projeto AWS D1.1 / NBR 8800",
    });
  });

  it("não inventa conteúdo quando a OP não possui PIT", () => {
    expect(pitDaOpParaDataBook(null, null)).toBeNull();
    expect(pitDaOpParaDataBook("DESCONHECIDO", "0")).toBeNull();
  });
});
