import { describe, it, expect } from "vitest";
import { materiaPrimaDaOP } from "@/lib/faturamento-direto";

// ─── DE QUEM É A MATÉRIA-PRIMA ───────────────────────────────────────────────
//
// ⚠⚠ A RESPOSTA JÁ EXISTIA NO CONTRATO. Matheus (22/09/2026): *"no Comercial eles já definem se a
// matéria-prima vai ser a TORG quem compra ou Faturamento Direto quando o cliente vai comprar —
// então já tem a resposta para a pergunta"*.

const op = (itens, aditivos = []) => ({
  itens: itens.map((fd) => ({ faturamentoDireto: fd })),
  aditivos: aditivos.map((a) => ({ itens: a.map((fd) => ({ faturamentoDireto: fd })) })),
});

describe("materiaPrimaDaOP", () => {
  it("nenhum item FD: a TORG compra", () => {
    expect(materiaPrimaDaOP(op([false, false]))).toEqual({ de: "TORG", itens: 2, fd: 0 });
  });

  it("todos FD: o cliente compra", () => {
    expect(materiaPrimaDaOP(op([true, true, true]))).toEqual({ de: "CLIENTE", itens: 3, fd: 3 });
  });

  // ⚠ MISTO É RESPOSTA, NÃO RUÍDO — arredondar para o lado mais comum esconderia metade da obra.
  it("parte FD é MISTO, com a contagem", () => {
    expect(materiaPrimaDaOP(op([true, false, false]))).toEqual({ de: "MISTO", itens: 3, fd: 1 });
  });

  // ⚠ O aditivo é contrato igual ao original: item novo acrescentado depois muda a natureza da obra.
  it("os itens dos aditivos contam junto", () => {
    expect(materiaPrimaDaOP(op([false, false], [[true]]))).toEqual({ de: "MISTO", itens: 3, fd: 1 });
  });

  // ⚠⚠ SEM ITEM NÃO HÁ RESPOSTA, e null é isso. Devolver "TORG" por ausência faria o simulador
  // afirmar, sobre uma obra vazia, exatamente a coisa que ele deveria perguntar.
  it.each([op([]), null, undefined, { itens: null }])("obra sem item não responde nada", (o) => {
    expect(materiaPrimaDaOP(o)).toBeNull();
  });
});
