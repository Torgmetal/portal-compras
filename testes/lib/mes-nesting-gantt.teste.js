import { describe, it, expect } from "vitest";
import { conferirComGantt, chaveDaPeca } from "@/lib/mes/nesting/conferir-gantt";

// O NESTING DO DIA CONTRA O QUE O PCP LIBEROU NO GANTT.
//
// ⚠⚠ A COMPARAÇÃO É DIRECIONAL — do plano para a liberação. Achado do Codex (13/09/2026) depois de
// eu medir no laboratório: a primeira versão comparava os dois conjuntos e acusou **432 marcas
// "liberadas e fora do plano"**, porque a fila da máquina é o BACKLOG (`lte fimDoDia`), não o dia.
// Estar liberado não obriga a entrar neste nesting — o programador escolhe o que cabe na chapa.

const unidade = (indice, itens) => ({ indice, itens });
const lote = (opNumero, marcas) => ({ opNumero, marcas });
const m = (marca, qte, feitas = 0) => ({ marca, qte, feitas });

describe("conferirComGantt", () => {
  it("plano dentro do que foi liberado é o caso bom", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "T107A-P1", opNumero: "T107A", qtd: 6 }])],
      [lote("T107A", [m("T107A-P1", 8)])],
    );
    expect(r.resumo).toMatchObject({ liberadas: 1, semLiberacao: 0, aMais: 0, bate: true });
  });

  // ⚠⚠ Marca cortada sem liberação: o material sai da chapa e não tem destino na obra.
  it("acusa a marca que está no plano e o PCP não liberou", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "T107A-P9", opNumero: "T107A", qtd: 2 }])],
      [lote("T107A", [m("T107A-P1", 8)])],
    );
    expect(r.semLiberacao.map((x) => x.marca)).toEqual(["T107A-P9"]);
    expect(r.resumo.bate).toBe(false);
  });

  // ⚠⚠ O CASO QUE DERRUBOU A PRIMEIRA VERSÃO. 432 marcas na fila do Laser Chapa, e o plano do dia
  // cobre 15. Cobrar isso seria alarme falso — e alarme falso ensina a ignorar a tarja.
  it("marca na fila que o plano não corta NÃO é divergência", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "A", opNumero: "097", qtd: 1 }])],
      [lote("097", [m("A", 1), m("B", 3), m("C", 9)])],
    );
    expect(r.resumo).toMatchObject({ naFila: 2, bate: true });
    expect(r.naFila.map((x) => x.marca)).toEqual(["B", "C"]);
  });

  it("marca já concluída não aparece nem como fila", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "A", opNumero: "097", qtd: 1 }])],
      [lote("097", [m("A", 1), m("B", 3, 3)])],
    );
    expect(r.naFila).toEqual([]);
  });

  // ⚠⚠ A MESMA MARCA EM DUAS OBRAS. Comparando só pela marca, uma obra "explicaria" a outra.
  it("marca igual em obra diferente não se explica", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "T97A16", opNumero: "102", qtd: 1 }])],
      [lote("097", [m("T97A16", 1)])],
    );
    expect(r.resumo).toMatchObject({ liberadas: 0, semLiberacao: 1 });
  });

  it("a grafia da obra não cria divergência falsa", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "M1", opNumero: "T89A", qtd: 1 }])],
      [lote("089", [m("M1", 1)])],
    );
    expect(r.resumo.bate).toBe(true);
  });

  // ⚠⚠ SEM OBRA NÃO EXISTE CHAVE (achado do Codex): antes a chave virava "?|MARCA" e duas peças de
  // obras desconhecidas casavam entre si — casamento inventado, que é o erro que isto evita.
  it("item sem obra vira ambiguidade declarada, não casamento", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "A", opNumero: null, qtd: 1 }])],
      [lote(null, [m("A", 1)])],
    );
    expect(r.resumo).toMatchObject({ liberadas: 0, semObra: 1, bate: false });
  });

  // ⚠⚠ COMPARA COM O SALDO, NÃO COM O TOTAL (achado do Codex): medir contra o total faria a
  // produção de ontem parecer folga de hoje.
  it("o excedente é medido contra o que ainda falta produzir", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "A", opNumero: "097", qtd: 5 }])],
      [lote("097", [m("A", 6, 4)])],   // liberadas 6, feitas 4 → saldo 2
    );
    expect(r.liberadas[0]).toMatchObject({ qtd: 5, qte: 6, feitas: 4, saldo: 2, aMais: 3 });
    expect(r.resumo.bate).toBe(false);
  });

  // ⚠ SOMA, não sobrescreve: com a queda para o setor a mesma marca chega por lotes diferentes, e
  // o último venceria — a liberação apareceria menor do que é.
  it("a mesma marca em dois lotes do Gantt soma", () => {
    const r = conferirComGantt(
      [unidade(1, [{ marca: "A", opNumero: "097", qtd: 5 }])],
      [lote("097", [m("A", 3)]), lote("097", [m("A", 2)])],
    );
    expect(r.liberadas[0]).toMatchObject({ qte: 5, aMais: 0 });
  });

  it("a mesma marca em barras diferentes soma, e diz em quais", () => {
    const r = conferirComGantt([
      unidade(1, [{ marca: "A", opNumero: "097", qtd: 1 }]),
      unidade(3, [{ marca: "A", opNumero: "097", qtd: 4 }]),
    ], [lote("097", [m("A", 5)])]);
    expect(r.liberadas[0]).toMatchObject({ qtd: 5, unidades: [1, 3] });
  });

  it("sem programação nenhuma, o plano inteiro fica sem liberação", () => {
    const r = conferirComGantt([unidade(1, [{ marca: "A", opNumero: "097", qtd: 1 }])], []);
    expect(r.resumo).toMatchObject({ semLiberacao: 1, bate: false });
  });

  it("a chave ignora zero à esquerda e caixa, e não nasce sem obra", () => {
    expect(chaveDaPeca("089", "m1")).toBe(chaveDaPeca("T89A", "M1"));
    expect(chaveDaPeca(null, "M1")).toBeNull();
  });
});
