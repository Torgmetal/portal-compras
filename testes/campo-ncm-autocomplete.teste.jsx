// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import CampoNcm from "@/app/fiscal/inteligencia/CampoNcm";

// ─── O AUTOCOMPLETE DO NCM ───────────────────────────────────────────────────
//
// ⚠⚠ É O CAMPO QUE O OPERADOR MENOS SABE DE CABEÇA, e o módulo nasceu de uma nota em que ele não
// sabia que o 8437.90.00 exigia destaque de IPI. Os testes aqui protegem as três coisas que fazem
// a lista ser confiável: uma linha por NCM, resposta fora de ordem não sobrescreve, e "nada
// encontrado" é resultado — não silêncio.

const linha = (ncm, ex = null, tipo = "PERCENTUAL", valor = 3.25) => ({
  ncm, ncmFormatado: `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}`, ex,
  descricao: "Outros", descricaoCompleta: `Máquinas … > Partes${ex ? ` (Ex ${ex})` : ""}`,
  ipi: { tipo, valor, rotulo: tipo === "NT" ? "NT — não tributado" : `${String(valor).replace(".", ",")}%` },
});

const responder = (resultados, atraso = 0) => () =>
  new Promise((r) => setTimeout(() => r({ json: async () => ({ success: true, resultados }) }), atraso));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function digitar(texto, onChange = () => {}) {
  render(<CampoNcm valor="" onChange={onChange} />);
  const campo = screen.getByRole("combobox");
  fireEvent.change(campo, { target: { value: texto } });
  await act(async () => { vi.advanceTimersByTime(400); });
  return campo;
}

describe("a lista que aparece enquanto se digita", () => {
  it("mostra código, descrição completa e a alíquota", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([linha("84379000")])));
    await digitar("8437");
    await waitFor(() => expect(screen.getByText("8437.90.00")).toBeTruthy());
    expect(screen.getByText(/Máquinas … > Partes/)).toBeTruthy();
    expect(screen.getByText("IPI 3,25%")).toBeTruthy();
  });

  // ⚠⚠ 23% DOS NCMs SE DESCREVEM SÓ COMO "Outros" — uma lista de oito "Outros" não ajuda ninguém.
  // Por isso o caminho hierárquico, e não a descrição da folha.
  it("usa a descrição COMPLETA, não a da folha", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([linha("84379000")])));
    await digitar("8437");
    await waitFor(() => expect(screen.getByText(/Máquinas … > Partes/)).toBeTruthy());
    expect(screen.queryByText(/^Outros$/)).toBeNull();
  });

  // ⚠⚠ NO POSTGRES, `ORDER BY "ex"` ASC DEIXA O Ex 01 ANTES DO NULL DA GERAL: a lista abriria com
  // uma exceção no lugar do código. Aqui o que se escolhe é o NCM.
  it("colapsa as linhas de Ex numa só, marcando quantas são", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([linha("12112000", "01"), linha("12112000", null, "NT", null)])));
    await digitar("1211");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByText("IPI NT — não tributado")).toBeTruthy();
    expect(screen.getByText("1 Ex TIPI")).toBeTruthy();
  });

  // ⚠ Sumir o menu faria a pessoa não saber se o portal buscou.
  it('"nada encontrado" é resultado, e diz o que tentar', async () => {
    vi.stubGlobal("fetch", vi.fn(responder([])));
    await digitar("99999999");
    await waitFor(() => expect(screen.getByText(/Nenhum NCM com esse código/)).toBeTruthy());
  });

  it("não busca com menos de 2 caracteres", async () => {
    const f = vi.fn(responder([linha("84379000")]));
    vi.stubGlobal("fetch", f);
    await digitar("8");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("escolher da lista", () => {
  it("devolve os 8 dígitos ao formulário e mostra o código formatado", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([linha("84379000")])));
    const onChange = vi.fn();
    await digitar("8437", onChange);
    await waitFor(() => expect(screen.getByText("8437.90.00")).toBeTruthy());
    fireEvent.click(screen.getByRole("option").querySelector("button"));
    // ⚠ O simulador consome dígitos; a tela mostra o formatado. São coisas diferentes de propósito.
    expect(onChange).toHaveBeenLastCalledWith("84379000");
    expect(screen.getByRole("combobox").value).toBe("8437.90.00");
  });

  // ⚠ Sem teclado, quem digita números rápido precisa tirar a mão do teclado justamente no campo
  // em que está digitando.
  it("↓ e Enter escolhem sem o mouse", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([linha("84379000"), linha("84371000")])));
    const onChange = vi.fn();
    const campo = await digitar("8437", onChange);
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("84371000");
  });

  it("Esc fecha a lista", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([linha("84379000")])));
    const campo = await digitar("8437");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(screen.queryByRole("option")).toBeNull();
  });

  // ⚠⚠ ESCOLHER NÃO PODE DISPARAR BUSCA NOVA — senão o menu reabre sozinho no clique.
  it("escolher não reabre o menu", async () => {
    const f = vi.fn(responder([linha("84379000")]));
    vi.stubGlobal("fetch", f);
    await digitar("8437");
    await waitFor(() => expect(screen.getByText("8437.90.00")).toBeTruthy());
    fireEvent.click(screen.getByRole("option").querySelector("button"));
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(screen.queryByRole("option")).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("resposta fora de ordem não sobrescreve a certa", () => {
  // ⚠⚠ "8437" SAI DEPOIS DE "84379" COM FREQUÊNCIA NUMA REDE LENTA, e a lista voltaria para o
  // termo anterior enquanto a pessoa ainda está digitando. É o defeito clássico de autocomplete, e
  // ele é invisível em rede rápida.
  it("a lista fica com o resultado do ÚLTIMO termo digitado", async () => {
    vi.stubGlobal("fetch", vi.fn((url) =>
      url.includes("84379")
        ? responder([linha("84379000")], 10)()
        : responder([linha("84371000"), linha("84372000")], 300)()));
    const onChange = vi.fn();
    render(<CampoNcm valor="" onChange={onChange} />);
    const campo = screen.getByRole("combobox");
    fireEvent.change(campo, { target: { value: "8437" } });
    await act(async () => { vi.advanceTimersByTime(260); });
    fireEvent.change(campo, { target: { value: "84379" } });
    await act(async () => { vi.advanceTimersByTime(700); });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByText("8437.90.00")).toBeTruthy();
  });
});
