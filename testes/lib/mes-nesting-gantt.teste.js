import { describe, it, expect } from "vitest";
import { conferirComGantt, chaveDaPeca } from "@/lib/mes/nesting/conferir-gantt";

// O NESTING DO DIA CONTRA O QUE O PCP LIBEROU NO GANTT.
//
// Matheus (13/09/2026): "o planejamento vai subir no Gantt as marcas liberadas para produzir naquela
// máquina; a ideia é bater o nesting do dia com o que está programado no Gantt". Duas listas, duas
// pessoas, o mesmo dia e a mesma máquina — quando discordam, alguém tem trabalho parado ou material
// cortado sem liberação.

const unidade = (indice, itens) => ({ indice, itens });
const lote = (opNumero, marcas) => ({ opNumero, marcas });
const m = (marca, qte, feitas = 0) => ({ marca, qte, feitas, concluida: qte > 0 && feitas >= qte });

describe("conferirComGantt", () => {
  it("as duas listas iguais é o caso bom", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "T107A-P1", opNumero: "T107A", qtd: 6 }])],
      [lote("T107A", [m("T107A-P1", 8)])],
    );
    expect(r.resumo).toMatchObject({ casadas: 1, foraDoGantt: 0, semNesting: 0, bate: true });
  });

  // ⚠⚠ Marca cortada sem o PCP ter liberado: o material sai da chapa e não tem para onde ir.
  it("acusa a marca que está no plano e o PCP não liberou", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "T107A-P9", opNumero: "T107A", qtd: 2 }])],
      [lote("T107A", [m("T107A-P1", 8)])],
    );
    expect(r.foraDoGantt.map((x) => x.marca)).toEqual(["T107A-P9"]);
    expect(r.resumo.bate).toBe(false);
  });

  it("acusa a marca liberada que o plano do dia não cobre", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "T107A-P1", opNumero: "T107A", qtd: 6 }])],
      [lote("T107A", [m("T107A-P1", 8), m("T107A-P5", 3)])],
    );
    expect(r.semNesting.map((x) => x.marca)).toEqual(["T107A-P5"]);
  });

  // ⚠ Marca liberada e JÁ CONCLUÍDA não é trabalho pendente — cobrá-la do plano de hoje seria
  // alarme falso, e alarme falso ensina a ignorar a tela.
  it("marca já concluída não é cobrada do plano", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "T107A-P1", opNumero: "T107A", qtd: 6 }])],
      [lote("T107A", [m("T107A-P1", 8), m("T107A-P5", 3, 3)])],
    );
    expect(r.semNesting).toEqual([]);
    expect(r.resumo.bate).toBe(true);
  });

  // ⚠⚠ A MESMA MARCA EM DUAS OBRAS. Comparando só pela marca, uma obra "explicaria" a outra e a
  // divergência sumiria — exatamente o erro que o casamento com o portal também evita.
  it("marca igual em obra diferente não se explica", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "T97A16", opNumero: "102", qtd: 1 }])],
      [lote("097", [m("T97A16", 1)])],
    );
    expect(r.resumo).toMatchObject({ casadas: 0, foraDoGantt: 1, semNesting: 1 });
  });

  // ⚠ A obra tem 90 grafias no banco ("89", "089", "T89A"): comparar cru acusaria divergência em
  // plano perfeito.
  it("a grafia da obra não cria divergência falsa", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "M1", opNumero: "T89A", qtd: 1 }])],
      [lote("089", [m("M1", 1)])],
    );
    expect(r.resumo.bate).toBe(true);
  });

  // ⚠ Cortar mais do que o liberado é legítimo (aproveitamento de chapa) e precisa aparecer: o
  // excedente não tem para onde ir na obra.
  it("mostra quando o plano corta mais do que o PCP liberou", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "A", opNumero: "097", qtd: 5 }])],
      [lote("097", [m("A", 3)])],
    );
    expect(r.casadas[0]).toMatchObject({ qtd: 5, qte: 3, aMais: 2 });
    expect(r.resumo.aMais).toBe(1);
  });

  it("a mesma marca em barras diferentes soma, e diz em quais", () => {
    const r = conferirComGantt([
      unidade(1, [{ marca: "A", opNumero: "097", qtd: 1 }]),
      unidade(3, [{ marca: "A", opNumero: "097", qtd: 4 }]),
    ], [lote("097", [m("A", 5)])]);
    expect(r.casadas[0]).toMatchObject({ qtd: 5, unidades: [1, 3] });
  });

  it("sem programação nenhuma, o plano inteiro fica fora do Gantt", () => {
    const r = conferirComGantt([unidade(1, [{ marca: "A", opNumero: "097", qtd: 1 }])], []);
    expect(r.resumo).toMatchObject({ foraDoGantt: 1, bate: false });
  });

  it("a chave ignora zero à esquerda e caixa", () => {
    expect(chaveDaPeca("089", "m1")).toBe(chaveDaPeca("T89A", "M1"));
  });
});
