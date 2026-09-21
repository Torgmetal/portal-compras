import { describe, it, expect } from "vitest";
import {
  classificarDecisaoPcp,
  ordenarDecisoesPcp,
} from "@/lib/pcp-fila-decisao";
const p = {
  id: "p1",
  marca: "P1",
  qte: 10,
  programacao: { situacao: "PROGRAMADA", qtdOk: true },
};
const conferencias = {
  material: true,
  desenho: true,
  maquina: true,
  rs: ["R42"],
};
const decidir = (peca = {}, conf = {}) =>
  classificarDecisaoPcp({ ...p, ...peca }, "CORTE", {
    ...conferencias,
    ...conf,
  });
describe("fila de decisão do PCP", () => {
  it("só recomenda liberação com todas as evidências e quantidade programada correta", () => {
    expect(decidir().estado).toBe("LIBERAR");
    for (const campo of ["material", "desenho", "maquina"]) {
      expect(decidir({}, { [campo]: false }).estado).toBe("PENDENTE");
      expect(decidir({}, { [campo]: null }).estado).toBe("PENDENTE");
    }
    expect(
      decidir({ programacao: { situacao: "PROGRAMADA", qtdOk: false } }).estado,
    ).toBe("PENDENTE");
  });
  it("não recomenda reimprimir trabalho já liberado, iniciado, concluído ou fora do lote", () => {
    expect(decidir({ grd: { id: "g" } }).estado).toBe("EM_ANDAMENTO");
    expect(decidir({ produzidoSyneco: 2 }).estado).toBe("EM_ANDAMENTO");
    expect(decidir({ produzidoSyneco: 7, baixadoQtd: 7 }).saldo).toBe(3);
    expect(decidir({ corteConcluidoEm: "2026-09-12" }).estado).toBe(
      "CONCLUIDA",
    );
    expect(decidir({ produzidoSyneco: 10 }).estado).toBe("CONCLUIDA");
    expect(decidir({ foraDoLote: true }).estado).toBe("FORA_DO_LOTE");
  });
  it("revisão e material aguardado impedem sugestão mesmo com conferências positivas", () => {
    expect(decidir({ destino: "REVISAO" }).estado).toBe("PENDENTE");
    expect(decidir({ destino: "AGUARDANDO_MATERIAL" }).estado).toBe("PENDENTE");
  });
  it("montagem exige croquis completos e dispensa arquivo de máquina do conjunto", () => {
    expect(
      classificarDecisaoPcp({ ...p, prontoMontar: true }, "MONTAGEM", {
        ...conferencias,
        maquina: null,
      }).estado,
    ).toBe("LIBERAR");
    expect(
      classificarDecisaoPcp(
        { ...p, prontoMontar: null },
        "MONTAGEM",
        conferencias,
      ).estado,
    ).toBe("PENDENTE");
    expect(
      classificarDecisaoPcp(
        { ...p, prontoMontar: false },
        "MONTAGEM",
        conferencias,
      ).motivos,
    ).toContain("Falta cortar os croquis");
  });
  it("fonte incompleta nunca aparece como pronta", () => {
    expect(decidir({}, { dadosCompletos: false }).estado).toBe("PENDENTE");
  });
  it("prioridade explícita precede impacto na montagem e não soma conjuntos repetidos", () => {
    const itens = [
      { marca: "P2", travaConjuntos: 9 },
      { marca: "P1", prioridade: 1, travaConjuntos: 2 },
      { marca: "P3", prioridade: 2, travaConjuntos: 8 },
    ];
    expect(ordenarDecisoesPcp(itens).map((x) => x.marca)).toEqual([
      "P1",
      "P3",
      "P2",
    ]);
    expect(itens[0].marca).toBe("P2");
  });
});
