// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import SessaoClient from "../app/expedicao/conferencia/[id]/SessaoClient";

// A TELA DE CAMPO, MONTADA. O que precisa ficar provado aqui é o que a pessoa VÊ com o celular na
// mão: a recusa aparece grande e legível, o que ela digitou não some junto com o erro, e o saldo
// que aparece é o que o servidor devolveu — nunca um número que o navegador somou sozinho.

vi.mock("next/link", () => ({ default: ({ children, ...p }) => <a {...p}>{children}</a> }));

const MARCAS = [
  { marca: "T97A140", descricao: "TRAVAMENTO EL.9325", previsto: 2, conferido: 0, saldo: 2, completa: false },
  { marca: "T97A180", descricao: "VIGA EL.10250", previsto: 5, conferido: 5, saldo: 0, completa: true },
];
const estado = (over = {}) => ({
  success: true,
  conferencia: { id: "c1", status: "ABERTA", opNumero: "097" },
  op: { numero: "097", cliente: "MEGASTEAM", obra: "Unipar" },
  marcas: MARCAS,
  lancamentos: [],
  progresso: { previsto: 7, conferido: 5, marcasCompletas: 1, marcasTotal: 2, pct: 71 },
  ...over,
});

/** o fetch: GET devolve o estado; POST devolve o que o teste mandar */
function servidor({ aoLancar, aoEditar, comLancamentos } = {}) {
  const base = comLancamentos ? { lancamentos: comLancamentos } : {};
  return vi.fn(async (url, opcoes) => {
    if (!opcoes || opcoes.method === undefined) {
      return { ok: true, status: 200, text: async () => JSON.stringify(estado(base)) };
    }
    if (opcoes.method === "POST") return aoLancar(JSON.parse(opcoes.body));
    if (opcoes.method === "PUT") return aoEditar(JSON.parse(opcoes.body));
    return { ok: true, status: 200, text: async () => JSON.stringify(estado(base)) };
  });
}

const ok = (over) => ({ ok: true, status: 200, text: async () => JSON.stringify(estado(over)) });
const recusa = (msg) => ({ ok: false, status: 409, text: async () => JSON.stringify({ error: msg, recusado: true }) });

const abrir = async () => {
  render(<SessaoClient id="c1" />);
  await screen.findByText(/MEGASTEAM/);
};
const digitar = (rotulo, valor) => fireEvent.change(screen.getByPlaceholderText(rotulo), { target: { value: valor } });
const campoMarca = () => screen.getByPlaceholderText(/letras da marca/);

beforeEach(() => { globalThis.React = React; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("conferência no celular", () => {
  it("mostra a obra e o andamento vindos do servidor", async () => {
    vi.stubGlobal("fetch", servidor());
    await abrir();
    expect(screen.getByText(/OP-097/)).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();          // conferidas
    expect(screen.getByText(/de 7 peças/)).toBeTruthy();
  });

  // ⚠⚠ O CASO DO PEDIDO: a mensagem de recusa tem que aparecer, e aparecer inteira.
  it("a recusa do servidor vira aviso na tela", async () => {
    const msg = "T97A140: a Lista de Expedição tem 2 peças e você já conferiu 2. Essa marca está completa.";
    vi.stubGlobal("fetch", servidor({ aoLancar: async () => recusa(msg) }));
    await abrir();
    digitar(/letras da marca/, "T97A140");
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Lançar conferência/ }));
    expect(await screen.findByText(msg)).toBeTruthy();
  });

  // ⚠ limpar num erro apagaria o que a pessoa digitou junto com o aviso que explica o erro.
  it("o que foi digitado continua na tela depois da recusa", async () => {
    vi.stubGlobal("fetch", servidor({ aoLancar: async () => recusa("não cabe") }));
    await abrir();
    digitar(/letras da marca/, "T97A140");
    fireEvent.click(screen.getByRole("button", { name: /Lançar conferência/ }));
    await screen.findByText("não cabe");
    expect(campoMarca().value).toBe("T97A140");
  });

  it("lançamento aceito limpa o formulário e confirma", async () => {
    vi.stubGlobal("fetch", servidor({
      aoLancar: async () => ok({ lancamentos: [{ id: "i1", marca: "T97A140", qte: 1, criadoEm: new Date().toISOString() }] }),
    }));
    await abrir();
    digitar(/letras da marca/, "T97A140");
    fireEvent.click(screen.getByRole("button", { name: /Lançar conferência/ }));
    await waitFor(() => expect(screen.getByText(/conferida\(s\)/)).toBeTruthy());
    expect(campoMarca().value).toBe("");
  });

  // ⚠⚠ Matheus (08/09/2026): "não é interessante aparecer a lista completa das marcas só de eu
  // clicar dentro do campo (…) o ideal é ir aparecendo conforme eu digito". A OP-97 tem 537 marcas.
  it("clicar no campo não despeja a lista inteira", async () => {
    vi.stubGlobal("fetch", servidor());
    await abrir();
    fireEvent.focus(screen.getByPlaceholderText(/letras da marca/));
    await waitFor(() => expect(screen.queryByText("faltam 2")).toBeNull());
    expect(screen.queryByText("completa")).toBeNull();
    // uma letra ainda não basta
    digitar(/letras da marca/, "T");
    await waitFor(() => expect(screen.queryByText("faltam 2")).toBeNull());
  });

  it("as sugestões aparecem a partir da segunda letra", async () => {
    vi.stubGlobal("fetch", servidor());
    await abrir();
    digitar(/letras da marca/, "T9");
    expect(await screen.findByText("faltam 2")).toBeTruthy();
    expect(screen.getByText("completa")).toBeTruthy();
    fireEvent.click(screen.getByText("T97A140"));
    await waitFor(() => expect(campoMarca().value).toBe("T97A140"));
  });

  // ⚠⚠ Matheus (08/09/2026): "quando eu selecionar a MARCA não deve preencher a quantidade total
  // automática, deve vir com 1 por padrão". Preencher com o saldo transforma CONTAR em CONFIRMAR:
  // um toque daria por conferidas 10 peças que ninguém olhou, com o número vindo da própria lista
  // que a conferência existe para checar.
  it("escolher a marca NÃO preenche a quantidade — fica 1", async () => {
    vi.stubGlobal("fetch", servidor());
    await abrir();
    digitar(/letras da marca/, "T97A140");
    // escopa na lista de sugestões: a marca também aparece no painel do saldo
    const sugestao = await waitFor(() => within(document.querySelector("ul")).getByText("T97A140"));
    fireEvent.click(sugestao);   // faltam 2
    await waitFor(() => expect(campoMarca().value).toBe("T97A140"));
    expect(screen.getByDisplayValue("1")).toBeTruthy();
    expect(screen.queryByDisplayValue("2")).toBeNull();
  });

  it("a aba da lista mostra a L.E. com o que falta", async () => {
    vi.stubGlobal("fetch", servidor());
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: /Lista da obra \(2\)/ }));
    expect(await screen.findByText("0/2")).toBeTruthy();
    // "só pendentes" é o padrão: a marca completa não aparece
    expect(screen.queryByText("5/5")).toBeNull();
  });

  // ⚠⚠ Matheus (08/09/2026): "depois de conferir uma marca, ser possível editar a quantidade dela lá
  // em CONFERIDO NESTA SESSÃO antes de encerrar a conferência".
  describe("corrigir a quantidade já lançada", () => {
    const LANCADO = [{ id: "i1", marca: "T97A140", qte: 2, criadoEm: new Date().toISOString() }];

    it("o lápis abre o editor com a quantidade atual", async () => {
      vi.stubGlobal("fetch", servidor({ comLancamentos: LANCADO }));
      await abrir();
      fireEvent.click(await screen.findByRole("button", { name: "Editar quantidade de T97A140" }));
      expect(screen.getByRole("textbox", { name: "Quantidade de T97A140" }).value).toBe("2");
      expect(screen.getByText("era 2")).toBeTruthy();
    });

    it("salvar manda o PUT com a nova quantidade e fecha o editor", async () => {
      const editado = [{ ...LANCADO[0], qte: 1 }];
      const fetchMock = servidor({
        comLancamentos: LANCADO,
        aoEditar: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(estado({ lancamentos: editado })) }),
      });
      vi.stubGlobal("fetch", fetchMock);
      await abrir();
      fireEvent.click(await screen.findByRole("button", { name: "Editar quantidade de T97A140" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Quantidade de T97A140" }), { target: { value: "1" } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar quantidade" }));
      await waitFor(() => expect(screen.queryByRole("textbox", { name: "Quantidade de T97A140" })).toBeNull());
      const put = fetchMock.mock.calls.find(([, o]) => o?.method === "PUT");
      expect(JSON.parse(put[1].body)).toEqual({ itemId: "i1", qte: 1 });
    });

    // ⚠ recusa do servidor mantém o editor aberto: fechar levaria embora o número digitado.
    it("recusa do servidor mantém o editor aberto e mostra o aviso", async () => {
      vi.stubGlobal("fetch", servidor({
        comLancamentos: LANCADO,
        aoEditar: async () => ({ ok: false, status: 409, text: async () => JSON.stringify({ error: "não cabe" }) }),
      }));
      await abrir();
      fireEvent.click(await screen.findByRole("button", { name: "Editar quantidade de T97A140" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Quantidade de T97A140" }), { target: { value: "99" } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar quantidade" }));
      expect(await screen.findByText("não cabe")).toBeTruthy();
      expect(screen.getByRole("textbox", { name: "Quantidade de T97A140" }).value).toBe("99");
    });

    it("cancelar fecha sem gravar", async () => {
      const fetchMock = servidor({ comLancamentos: LANCADO });
      vi.stubGlobal("fetch", fetchMock);
      await abrir();
      fireEvent.click(await screen.findByRole("button", { name: "Editar quantidade de T97A140" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancelar edição" }));
      await waitFor(() => expect(screen.queryByRole("textbox", { name: "Quantidade de T97A140" })).toBeNull());
      expect(fetchMock.mock.calls.some(([, o]) => o?.method === "PUT")).toBe(false);
    });

    it("conferência encerrada não oferece o lápis", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true, status: 200,
        text: async () => JSON.stringify(estado({
          lancamentos: LANCADO, conferencia: { id: "c1", status: "FINALIZADA", opNumero: "097" },
        })),
      })));
      await abrir();
      expect(screen.queryByRole("button", { name: "Editar quantidade de T97A140" })).toBeNull();
    });
  });

  it("conferência encerrada não mostra o formulário", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify(estado({ conferencia: { id: "c1", status: "FINALIZADA", opNumero: "097" } })),
    })));
    await abrir();
    expect(screen.queryByRole("button", { name: /Lançar conferência/ })).toBeNull();
    expect(screen.getByText(/foi encerrada/)).toBeTruthy();
  });
});
