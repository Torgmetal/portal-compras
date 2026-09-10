// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import EtiquetasClient from "../app/expedicao/etiquetas/EtiquetasClient";

// A ESCOLHA DO MODELO, NA TELA MONTADA. O que precisa ficar provado aqui é a fiação: que o modelo
// escolhido chega na rota de impressão, que a planilha do cliente só aparece no modelo que a usa, e
// que trocar de obra não desfaz a escolha.

const OPS = [
  { id: "op102", numero: "102", cliente: "QWS", obra: "Revamp", marcas: 2 },
  { id: "op97", numero: "097", cliente: "MEGASTEAM", obra: "Unipar", marcas: 1 },
];
const PECAS = [{ id: "p1", marca: "T102A1", descricao: "L2''X1/4''", qte: 1, pesoUnitKg: 13.26, impressaEm: null, impressoes: 0 }];

let chamadas;

const responder = (url) => {
  const u = String(url);
  if (u.includes("campos-extras")) return { success: true, opNumero: "102", total: 77 };
  if (u.includes("opId=")) return { success: true, op: OPS[0], pecas: PECAS };
  return { success: true, ops: OPS };
};

beforeEach(() => {
  chamadas = [];
  globalThis.React = React;
  // `imprimir` lê o PDF como blob e abre em aba nova — nada disso existe no jsdom.
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
  vi.stubGlobal("open", vi.fn());
  // ⚠ A chamada é registrada AQUI, não dentro de `text()`: o POST do PDF só lê `blob()`, então
  // registrar na leitura do corpo deixava a impressão invisível para o teste.
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    chamadas.push({ url: String(url), init });
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify(responder(url)),
      blob: async () => new Blob(["%PDF"]),
    };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const seletores = () => screen.getAllByRole("combobox");

const abrirOP = async (id = "op102") => {
  render(<EtiquetasClient />);
  fireEvent.change(await screen.findByRole("combobox"), { target: { value: id } });
  await screen.findByText("T102A1");
};

const escolherModelo = async (valor) => {
  await waitFor(() => expect(seletores()).toHaveLength(2));
  fireEvent.change(seletores()[1], { target: { value: valor } });
};

describe("seletor de modelo da etiqueta", () => {
  it("só aparece depois de escolher a obra", async () => {
    render(<EtiquetasClient />);
    await screen.findByRole("combobox");
    expect(seletores()).toHaveLength(1);
    fireEvent.change(seletores()[0], { target: { value: "op102" } });
    await waitFor(() => expect(seletores()).toHaveLength(2));
  });

  it("começa no padrão — o modelo do cliente é a exceção, não o normal", async () => {
    await abrirOP();
    await waitFor(() => expect(seletores()[1].value).toBe("padrao"));
  });

  // ⚠ A TELA DE ETIQUETAS NÃO TEM UPLOAD, DE PROPÓSITO: marca, peso e quantidade já estão no
  // portal. A planilha só existe no modelo do cliente, que pede códigos que o portal não tem.
  it("a planilha do cliente só aparece no modelo que precisa dela", async () => {
    await abrirOP();
    expect(screen.queryByText(/Importar planilha/)).toBeNull();
    await escolherModelo("qws");
    await screen.findByText(/Importar planilha/);
  });

  it("mostra quantas marcas já têm os campos importados", async () => {
    await abrirOP();
    await escolherModelo("qws");
    await screen.findByText(/77 marca\(s\) já importada\(s\)/);
  });

  it("o modelo escolhido vai junto no pedido de impressão", async () => {
    await abrirOP();
    await escolherModelo("qws");
    fireEvent.click(screen.getByText("T102A1"));
    fireEvent.click(screen.getByText(/Gerar etiquetas/));
    await waitFor(() => {
      const post = chamadas.find((c) => c.init?.method === "POST" && !c.url.includes("campos-extras"));
      expect(JSON.parse(post.init.body)).toMatchObject({ opId: "op102", modelo: "qws", marcas: ["T102A1"] });
    });
  });

  // ⚠ Quem imprime para um cliente costuma imprimir várias OPs dele seguidas. Voltar ao padrão
  // sozinho ao trocar de obra faria a etiqueta errada sair sem ninguém ser avisado.
  it("trocar de obra não desfaz a escolha do modelo", async () => {
    await abrirOP();
    await escolherModelo("qws");
    fireEvent.change(seletores()[0], { target: { value: "op97" } });
    await waitFor(() => expect(seletores()[1].value).toBe("qws"));
  });
});
