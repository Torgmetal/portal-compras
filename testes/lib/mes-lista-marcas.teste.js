import { describe, it, expect } from "vitest";
import { ordenarLotes, visiveis, QUANTAS } from "@/app/mes-lab/totem/[codigo]/lista-marcas";

// A LISTA DO POSTO, CURTA O BASTANTE PARA SER LIDA.
//
// ⚠⚠ A captura da tela inteira do Laser Cantoneira deu **70.360 px** (13/09/2026): 730 marcas de
// backlog empilhadas num monitor de chão de fábrica. Despejar tudo é o mesmo que não mostrar nada.

const m = (marca, concluida = false) => ({ id: marca, marca, concluida });

describe("ordenarLotes", () => {
  // ⚠ Marca concluída não é trabalho, é histórico — e histórico no topo empurra para baixo o que o
  // operador precisa fazer agora.
  it("põe a marca concluída no fim da obra", () => {
    const [lote] = ordenarLotes([{ opNumero: "097", marcas: [m("A", true), m("B"), m("C", true), m("D")] }]);
    expect(lote.marcas.map((x) => x.marca)).toEqual(["B", "D", "A", "C"]);
  });

  it("a obra com mais pendência vem primeiro", () => {
    const r = ordenarLotes([
      { opNumero: "097", marcas: [m("A", true), m("B", true)] },
      { opNumero: "102", marcas: [m("C"), m("D")] },
    ]);
    expect(r.map((l) => l.opNumero)).toEqual(["102", "097"]);
  });

  it("empate desempata pelo número da obra, para a ordem não dançar a cada carregamento", () => {
    const r = ordenarLotes([{ opNumero: "102", marcas: [m("C")] }, { opNumero: "097", marcas: [m("A")] }]);
    expect(r.map((l) => l.opNumero)).toEqual(["097", "102"]);
  });

  it("sem lote nenhum, não quebra", () => {
    expect(ordenarLotes()).toEqual([]);
  });
});

describe("visiveis", () => {
  const muitas = Array.from({ length: 40 }, (_, i) => m(`M${i}`));

  it("mostra só as primeiras", () => {
    expect(visiveis(muitas, false)).toHaveLength(QUANTAS);
  });

  it("aberto, mostra tudo", () => {
    expect(visiveis(muitas, true)).toHaveLength(40);
  });

  // ⚠⚠ O CORTE É POR OBRA, não pela lista toda: cortando o total, a segunda obra sumiria inteira e
  // o operador acharia que ela não está programada.
  it("lista curta não é cortada", () => {
    expect(visiveis([m("A"), m("B")], false)).toHaveLength(2);
  });
});
