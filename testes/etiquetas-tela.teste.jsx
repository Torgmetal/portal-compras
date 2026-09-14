// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import EtiquetasClient from "../app/expedicao/etiquetas/EtiquetasClient";

// A TELA DE VERDADE, MONTADA. Matheus (08/09/2026): "no cabeçalho coloque os filtros igual fizemos
// anteriormente tipo excel". O funil vem do `components/FiltroColuna`, que já é testado por onde
// nasceu — o que precisa ficar provado AQUI é a fiação: que as colunas certas têm funil, que ele
// enxerga a coluna "Etiqueta" e que a busca por texto e o funil se compõem em vez de brigar.

const OPS = [{ id: "op1", numero: "097", cliente: "MEGASTEAM", obra: "Unipar", marcas: 3 }];
const PECAS = [
  { id: "p1", marca: "T97A140", descricao: "TRAVAMENTO EL.9325", qte: 1, pesoUnitKg: 4.46, impressaEm: "2026-09-08T14:20:00Z", impressoes: 2 },
  { id: "p2", marca: "T97A180", descricao: "VIGA EL.10250", qte: 2, pesoUnitKg: 88, impressaEm: null, impressoes: 0 },
  { id: "p3", marca: "T97-AC8", descricao: "PARAFUSO SEXT. A325", qte: 40, pesoUnitKg: 0.1, impressaEm: null, impressoes: 0 },
];

const linhas = () => within(document.querySelector("table tbody")).queryAllByRole("row")
  .map((tr) => tr.cells[1]?.textContent).filter(Boolean);
// o menu do funil é `fixed` e vive fora da tabela — escopar evita casar com a própria linha
const menu = () => within(document.querySelector(".fixed.z-\\[100\\]"));

const abrirOP = async () => {
  render(<EtiquetasClient />);
  const seletor = await screen.findByRole("combobox");
  fireEvent.change(seletor, { target: { value: "op1" } });
  await screen.findByText("T97A140");
};

beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("fetch", vi.fn(async (url) => ({
    ok: true, status: 200,
    text: async () => JSON.stringify(String(url).includes("opId=")
      ? { success: true, op: OPS[0], pecas: PECAS }
      : { success: true, ops: OPS }),
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("filtros de coluna na lista de marcas", () => {
  it("as colunas Marca, Descrição e Etiqueta têm funil; Peças e Peso não", async () => {
    await abrirOP();
    for (const c of ["Marca", "Descrição", "Etiqueta"])
      expect(screen.getByRole("button", { name: c })).toBeTruthy();
    for (const c of ["Peças", "Peso unit. (kg)"])
      expect(screen.queryByRole("button", { name: c })).toBeNull();
  });

  it("o funil de Etiqueta separa o que já saiu do que falta imprimir", async () => {
    await abrirOP();
    fireEvent.click(screen.getByRole("button", { name: "Etiqueta" }));
    fireEvent.click(await screen.findByText(/Não impressa/));
    await waitFor(() => expect(linhas()).toEqual(["T97A180", "T97-AC8"]));
  });

  // ⚠ é a regra do useListaFiltrada: os funis leem a lista JÁ buscada.
  it("as opções do funil respeitam a busca por texto", async () => {
    await abrirOP();
    fireEvent.change(screen.getByPlaceholderText(/Filtrar por marca/), { target: { value: "VIGA" } });
    await waitFor(() => expect(linhas()).toEqual(["T97A180"]));
    fireEvent.click(screen.getByRole("button", { name: "Marca" }));
    await waitFor(() => expect(document.querySelector(".fixed")).toBeTruthy());
    expect(menu().getByText("T97A180")).toBeTruthy();
    expect(menu().queryByText("T97-AC8")).toBeNull();
  });

  it("'Marcar todas' marca só o que o filtro deixou na tela", async () => {
    await abrirOP();
    fireEvent.click(screen.getByRole("button", { name: "Etiqueta" }));
    fireEvent.click(await screen.findByText(/Não impressa/));
    await waitFor(() => expect(linhas()).toHaveLength(2));
    fireEvent.click(screen.getByText(/Marcar todas/));
    // 2 marcas = 2 + 40 peças; a já impressa (1 peça) fica de fora.
    // ⚠ ESCOPADO AO CONTADOR DA BARRA desde que a lista ganhou rodapé de totais (14/09/2026): o
    // mesmo 42 passou a aparecer também no fim da tabela, e `getByText("42")` solto casaria com os
    // dois. O que este teste prova é a SELEÇÃO, não a soma da lista.
    await waitFor(() => expect(screen.getByText(/etiqueta\(s\)/).textContent).toContain("42"));
  });

  // ⚠ ESTE TESTE ACHOU UM BUG DE VERDADE: "Limpar" era `disabled={!sel.size}`, então com um funil
  // ativo e nada marcado o botão estava apagado — morto justamente quando é o filtro que está
  // escondendo marca da tela.
  it("'Limpar' devolve a lista inteira mesmo sem nada marcado", async () => {
    await abrirOP();
    fireEvent.click(screen.getByRole("button", { name: "Etiqueta" }));
    fireEvent.click(await screen.findByText(/Não impressa/));
    await waitFor(() => expect(linhas()).toHaveLength(2));
    fireEvent.click(screen.getByText("Limpar"));
    await waitFor(() => expect(linhas()).toHaveLength(3));
  });

  // ⚠ A COLUNA É ACHADA PELO CABEÇALHO, NÃO POR ÍNDICE. Este teste já quebrou uma vez por isso: ao
  // inserir a coluna "Etiquetas" (a da caixa) antes desta, o `cells[5]` passou a apontar para o
  // peso. Índice fixo transforma qualquer coluna nova num teste vermelho que não diz nada sobre o
  // que de fato quebrou.
  const celulaDa = (marca, cabecalho) => {
    const titulos = [...document.querySelectorAll("table thead th")].map((th) => th.textContent.trim());
    const i = titulos.findIndex((t) => t.toLowerCase() === cabecalho.toLowerCase());
    const tr = within(document.querySelector("table tbody")).getByText(marca).closest("tr");
    return tr.cells[i];
  };

  it("a coluna Etiqueta mostra a data e as reimpressões", async () => {
    await abrirOP();
    expect(celulaDa("T97A140", "Etiqueta").textContent).toMatch(/08\/09/);
    expect(celulaDa("T97A140", "Etiqueta").textContent).toContain("×2");
    expect(celulaDa("T97A180", "Etiqueta").textContent.trim()).toBe("—");
  });
});

// ─── O FECHAMENTO DA LISTA (Matheus, 14/09/2026) ─────────────────────────────
//
// "preciso arrumar a tela de etiquetas para ter um total no fim da lista calculando o total de
// itens e total de marcas".

const rodape = () => within(document.querySelector("table tfoot"));

describe("o total no fim da lista", () => {
  it("soma marcas, peças, etiquetas e quilos do que está na tela", async () => {
    await abrirOP();
    const celulas = [...document.querySelector("table tfoot tr").cells].map((c) => c.textContent);
    expect(celulas[2]).toContain("3");            // 3 marcas
    expect(celulas[3]).toBe("43");                // 1 + 2 + 40 peças
    expect(celulas[4]).toBe("43");                // uma etiqueta por peça
    // 1×4,46 + 2×88 + 40×0,10 = 184,46
    expect(celulas[5]).toContain("184,46");
  });

  // ⚠⚠ ETIQUETAS ≠ PEÇAS. A marca em caixa rende UMA etiqueta para as 40 peças; somar peças no
  // lugar de etiquetas diria que o rolo precisa de 39 adesivos que ninguém vai colar.
  it("a marca em caixa conta 1 etiqueta, mas continua contando as 40 peças", async () => {
    await abrirOP();
    fireEvent.click(screen.getByTitle(/Uma etiqueta por peça \(40 no total\)/));
    const celulas = [...document.querySelector("table tfoot tr").cells].map((c) => c.textContent);
    expect(celulas[3]).toBe("43");                // peças não mudam
    expect(celulas[4]).toBe("4");                 // 1 + 2 + 1 etiqueta
  });

  // ⚠⚠ O TOTAL É DO QUE ESTÁ NA TELA, e quando o filtro esconde algo a linha DIZ isso. Um rodapé
  // que soma a obra inteira enquanto a tela mostra 1 marca filtrada é pior que rodapé nenhum.
  it("com filtro ativo, o total é do filtrado e avisa de quantas", async () => {
    await abrirOP();
    fireEvent.change(screen.getByPlaceholderText(/Filtrar por marca/), { target: { value: "T97-AC8" } });
    await waitFor(() => expect(linhas()).toEqual(["T97-AC8"]));
    expect(rodape().getByText(/filtrado/i)).toBeTruthy();
    const celulas = [...document.querySelector("table tfoot tr").cells].map((c) => c.textContent);
    expect(celulas[2]).toContain("de 3");
    expect(celulas[3]).toBe("40");
  });

  // ⚠ Lista vazia não tem o que somar: um rodapé de zeros embaixo de "nenhuma marca" só confunde.
  it("sem nenhuma marca visível, não há rodapé", async () => {
    await abrirOP();
    fireEvent.change(screen.getByPlaceholderText(/Filtrar por marca/), { target: { value: "zzzz" } });
    await waitFor(() => expect(linhas()).toEqual([]));
    expect(document.querySelector("table tfoot")).toBeNull();
  });
});
