// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
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
  new Promise((r) => setTimeout(() => r({ ok: true, status: 200, json: async () => ({ success: true, resultados }) }), atraso));

/**
 * ⚠⚠ O PAI COM ESTADO É O QUE FALTAVA NOS TESTES ANTERIORES (achado do Codex, 22/09/2026). Fixando
 * `valor=""` eu nunca reproduzia o que o formulário de verdade faz: devolver ao campo o valor que
 * ele acabou de emitir. Era exatamente por esse caminho que escolher um NCM reabria o menu.
 */
function ComPai({ inicial = "" }) {
  const [v, setV] = useState(inicial);
  return (
    <>
      <CampoNcm valor={v} onChange={setV} />
      <output data-testid="valor">{v}</output>
    </>
  );
}

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

// ─── OS ACHADOS DO CODEX (22/09/2026) ───────────────────────────────────────

describe("escolher, com o formulário devolvendo o valor", () => {
  // ⚠⚠ O DEFEITO: `escolher` gravava "8437.90.00" no campo e mandava "84379000" ao formulário; o
  // pai devolvia isso como `valor`, o campo trocava o texto pelos dígitos — string diferente — e a
  // BUSCA DISPARAVA DE NOVO, reabrindo o menu que acabara de fechar. Fixando `valor=""`, o teste
  // antigo nunca via isso.
  it("não reabre o menu nem busca de novo quando o pai devolve o valor", async () => {
    const f = vi.fn(responder([linha("84379000")]));
    vi.stubGlobal("fetch", f);
    render(<ComPai />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "8437" } });
    await act(async () => { vi.advanceTimersByTime(400); });
    await waitFor(() => expect(screen.getByText("8437.90.00")).toBeTruthy());

    fireEvent.click(screen.getByRole("option").querySelector("button"));
    await act(async () => { vi.advanceTimersByTime(800); });

    expect(screen.queryByRole("option")).toBeNull();
    // ⚠ E o campo mantém o código FORMATADO, não é sobrescrito pelos dígitos crus do pai.
    expect(screen.getByRole("combobox").value).toBe("8437.90.00");
    expect(screen.getByTestId("valor").textContent).toBe("84379000");
    expect(f).toHaveBeenCalledTimes(1);
  });

  // ⚠ O caminho inverso continua valendo: quando o pai muda o valor por fora (limpar o
  // formulário), o campo acompanha.
  it("o campo acompanha quando o pai muda o valor por fora", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([linha("84379000")])));
    render(<ComPai inicial="12345678" />);
    expect(screen.getByRole("combobox").value).toBe("12345678");
  });
});

describe("limpar o campo com requisição no ar", () => {
  // ⚠⚠ O DEFEITO: o retorno para termo curto acontecia ANTES de invalidar a vez. A requisição já
  // disparada continuava válida e resolvia chamando `setAberto(true)` — sugestões reaparecendo
  // sobre um campo vazio, prontas para serem escolhidas por engano.
  it("resposta que chega depois de apagar não reabre a lista", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([linha("84379000")], 400)));
    render(<ComPai />);
    const campo = screen.getByRole("combobox");
    fireEvent.change(campo, { target: { value: "8437" } });
    await act(async () => { vi.advanceTimersByTime(300); });
    fireEvent.change(campo, { target: { value: "" } });
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("a linha de Ex nunca fala pelo NCM", () => {
  // ⚠⚠ A BUSCA CORTA NO LIMITE ANTES DE AGRUPAR, e na busca por código o Postgres devolve o Ex
  // ANTES do NULL da geral. Dava para a lista mostrar a ALÍQUOTA DA EXCEÇÃO como se fosse a do
  // NCM — e o clique manda só os 8 dígitos, jogando fora a exceção de onde o número saiu. Seria o
  // contrato 2 do módulo ("Ex desconhecido não significa geral") quebrado pela própria tela.
  it("sem a linha geral na resposta, não sai número", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([linha("12112000", "01", "PERCENTUAL", 0)])));
    render(<ComPai />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1211" } });
    await act(async () => { vi.advanceTimersByTime(400); });
    await waitFor(() => expect(screen.getByText("1211.20.00")).toBeTruthy());
    expect(screen.getByText(/IPI depende do Ex/)).toBeTruthy();
    expect(screen.queryByText("IPI 0%")).toBeNull();
  });

  it("com a linha geral, a alíquota é a dela — e o Ex vira marca", async () => {
    vi.stubGlobal("fetch", vi.fn(responder([
      linha("12112000", "01", "PERCENTUAL", 0),
      linha("12112000", null, "NT", null),
    ])));
    render(<ComPai />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1211" } });
    await act(async () => { vi.advanceTimersByTime(400); });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByText("IPI NT — não tributado")).toBeTruthy();
    expect(screen.getByText("1 Ex TIPI")).toBeTruthy();
    expect(screen.queryByText(/IPI depende do Ex/)).toBeNull();
  });
});

describe("falha de consulta não é ausência de NCM", () => {
  // ⚠⚠ UM 403 VIRAVA "Nenhum NCM com esse código" — e a pessoa concluía que o código não existe,
  // quando o que houve foi falha de permissão. São estados diferentes, com conserto diferente.
  it("403 mostra o erro e oferece nova tentativa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ success: false, error: "Forbidden" }) })));
    render(<ComPai />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "8437" } });
    await act(async () => { vi.advanceTimersByTime(400); });
    await waitFor(() => expect(screen.getByText(/Forbidden/)).toBeTruthy());
    expect(screen.queryByText(/Nenhum NCM/)).toBeNull();
    expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeTruthy();
  });

  it("queda de rede também é erro, não lista vazia", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }));
    render(<ComPai />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "8437" } });
    await act(async () => { vi.advanceTimersByTime(400); });
    await waitFor(() => expect(screen.getByText(/Failed to fetch/)).toBeTruthy());
    expect(screen.queryByText(/Nenhum NCM/)).toBeNull();
  });

  // ⚠ "Tentar de novo" precisa de um contador: repor o MESMO termo não reexecuta o efeito, e o
  // botão ficaria mudo justamente quando a rede caiu.
  it("tentar de novo refaz a busca", async () => {
    let falhar = true;
    const f = vi.fn(async () => {
      if (falhar) { falhar = false; throw new Error("rede"); }
      return { ok: true, status: 200, json: async () => ({ success: true, resultados: [linha("84379000")] }) };
    });
    vi.stubGlobal("fetch", f);
    render(<ComPai />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "8437" } });
    await act(async () => { vi.advanceTimersByTime(400); });
    await waitFor(() => expect(screen.getByText(/rede/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    await act(async () => { vi.advanceTimersByTime(400); });
    await waitFor(() => expect(screen.getByText("8437.90.00")).toBeTruthy());
    expect(f).toHaveBeenCalledTimes(2);
  });

  // ⚠ "Nenhuma TIPI importada" é outra coisa que "esse NCM não existe" — e o conserto é de
  // administrador, não de quem está digitando.
  it("ausência de TIPI ativa aparece com o motivo da fonte", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ success: true, resultados: [], motivo: "Nenhuma versão da TIPI foi importada ainda." }) })));
    render(<ComPai />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "8437" } });
    await act(async () => { vi.advanceTimersByTime(400); });
    await waitFor(() => expect(screen.getByText(/Nenhuma versão da TIPI/)).toBeTruthy());
    expect(screen.queryByText(/Nenhum NCM/)).toBeNull();
  });
});
