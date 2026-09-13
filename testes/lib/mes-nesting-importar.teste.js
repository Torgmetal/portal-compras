import { describe, it, expect } from "vitest";
import { casarComOPortal, linhasDoPlano, marcasDoPlano } from "@/lib/mes/nesting/importar";

// DO PLANO PARA O BANCO — o casamento com `PecaConjunto` e a explosão em itens.
//
// ⚠⚠ O nesting NÃO é uma nova lista do que produzir (§3.2): é um agrupamento físico de marcas que
// já existem no portal. O que não casar tem de aparecer, nunca entrar calado.

const peca = (id, marca, opNumero) => ({ id, marca, opNumero, opId: null });

describe("casarComOPortal", () => {
  it("casa a marca que existe uma vez só", () => {
    const { casamento, pendentes } = casarComOPortal(["T107A-P1"], [peca("p1", "T107A-P1", "T107A")]);
    expect(casamento.get("T107A-P1").id).toBe("p1");
    expect(pendentes).toEqual([]);
  });

  // ⚠⚠ A MESMA MARCA SE REPETE ENTRE OBRAS. Casar só pela marca daria baixa na obra errada, e erro
  // de baixa só aparece no inventário, meses depois.
  it("desempata pela obra do arquivo", () => {
    const { casamento } = casarComOPortal(["T97A16"], [
      peca("p1", "T97A16", "097"), peca("p2", "T97A16", "102"),
    ], "T97A");
    expect(casamento.get("T97A16").id).toBe("p1");
  });

  // ⚠ A obra tem 90 grafias no banco ("89", "089", "T89A"). Comparar cru descartaria casamento bom.
  it("a grafia da obra não atrapalha", () => {
    const { casamento } = casarComOPortal(["M1"], [peca("p1", "M1", "089")], "T89A");
    expect(casamento.get("M1").id).toBe("p1");
  });

  it("marca em duas obras e nenhuma é a do arquivo vira pendência, não palpite", () => {
    const { casamento, pendentes } = casarComOPortal(["T97A16"], [
      peca("p1", "T97A16", "102"), peca("p2", "T97A16", "103"),
    ], "T107A");
    expect(casamento.size).toBe(0);
    expect(pendentes[0].motivo).toMatch(/nenhuma é T107A/);
  });

  it("marca que não existe no portal é dita assim", () => {
    const { pendentes } = casarComOPortal(["INVENTADA"], []);
    expect(pendentes[0]).toMatchObject({ marca: "INVENTADA", motivo: "Esta marca não existe no portal." });
  });
});

const PLANO = {
  barras: [{
    indice: 1, pecas: 4, sobraMm: 2.13, aproveitamento: 100,
    itens: [{ marca: "A", qtd: 1 }, { marca: "B", qtd: 3 }],
    cortes: [
      { marca: "A", deduzida: true }, { marca: "B" }, { marca: "B" }, { marca: "B" },
    ],
  }],
};

describe("linhasDoPlano", () => {
  it("junta as marcas do plano inteiro para procurar de uma vez", () => {
    expect(marcasDoPlano(PLANO).sort()).toEqual(["A", "B"]);
  });

  // ⚠ Com a ordem de corte, a contagem vem dos CORTES (o fato) e a marca leva a posição em que
  // aparece primeiro — é o que deixa o totem dizer "está cortando a 3ª de 7".
  it("com o arquivo da máquina, conta os cortes e guarda a ordem", () => {
    const [u] = linhasDoPlano(PLANO);
    expect(u.itens).toEqual([
      { marca: "A", qtd: 1, ordem: 1, deduzida: true, pecaConjuntoId: null, opNumero: null },
      { marca: "B", qtd: 3, ordem: 2, deduzida: false, pecaConjuntoId: null, opNumero: null },
    ]);
  });

  it("sem o arquivo da máquina, vale a tabela do relatório — a lista que o operador já lê", () => {
    const [u] = linhasDoPlano({ barras: [{ ...PLANO.barras[0], cortes: [] }] });
    expect(u.itens.map((i) => [i.marca, i.qtd, i.ordem])).toEqual([["A", 1, null], ["B", 3, null]]);
  });

  it("leva a peça casada para o item", () => {
    const { casamento } = casarComOPortal(["A", "B"], [peca("p1", "A", "097"), peca("p2", "B", "097")]);
    const [u] = linhasDoPlano(PLANO, { casamento });
    expect(u.itens[0]).toMatchObject({ pecaConjuntoId: "p1", opNumero: "097" });
  });

  it("a chapa do Laser Chapa é marcada como CHAPA, não barra", () => {
    expect(linhasDoPlano(PLANO, { tipo: "CHAPA" })[0].tipo).toBe("CHAPA");
  });
});
