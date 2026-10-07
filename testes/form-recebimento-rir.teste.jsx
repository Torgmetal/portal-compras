// @vitest-environment jsdom
// O preenchimento do recebimento por certificado no computador (RRP e RRA, 07/10/2026): uma linha por
// certificado, as três inspeções (A, R, N.A.), incluir mais certificados do CMR ou um item à mão.
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import FormRecebimentoRir from "@/app/qualidade/inspecoes/[id]/FormRecebimentoRir";

const ITEM = { docId: "d1", r: "261266", descricao: "REVELADOR DE TRINCAS METALCHECK D-70", nf: "325883", certificado: "202600149", lote: "LT-26-1228", pc: "1903", quantidade: "5", visual: null, dimensional: null, documentos: null };

let ultimo;
function Tela({ itens = [ITEM], resultadoInspecao = null }) {
  const [res, setRes] = useState({ itens, contrato: "4600123456" });
  ultimo = res;
  return <FormRecebimentoRir rel={{ tipo: "RECEBIMENTO_PENETRANTE", opNumero: "102", resultadoInspecao, createdAt: "2026-10-07T12:00:00Z" }} res={res} travado={false}
    setResultado={(k, v) => setRes((r) => ({ ...r, [k]: v }))} />;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ certificados: [
    { docId: "d9", r: "261999", descricao: "PENETRANTE VP-30", nf: "325883", certificado: "202600150", lote: "LT-9", quantidade: "5", recebidoEm: "2026-08-25", opNumero: null, temPdf: true, visual: "", dimensional: "", documentos: "", rnc: "", itemNf: "", pc: "1903", fornecedor: "COMERCIAL", validade: "", norma: "" },
  ], total: 1, classe: "penetrante, revelador e removedor" }) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("itens do recebimento", () => {
  it("mostra cada certificado com os dados do CMR", () => {
    render(<Tela />);
    expect(screen.getByDisplayValue("REVELADOR DE TRINCAS METALCHECK D-70")).toBeTruthy();
    expect(screen.getByDisplayValue("202600149")).toBeTruthy();
    expect(screen.getByText("R 261266")).toBeTruthy();
  });

  it("marcar as três inspeções grava no item e o resultado sugerido aparece", () => {
    render(<Tela />);
    fireEvent.click(screen.getByLabelText("Item 1, Visual: A"));
    fireEvent.click(screen.getByLabelText("Item 1, Dimensional: N.A."));
    fireEvent.click(screen.getByLabelText("Item 1, Documentação: A"));
    expect(ultimo.itens[0]).toMatchObject({ visual: "A", dimensional: "NA", documentos: "A" });
    expect(screen.getByText("APROVADO")).toBeTruthy();
  });

  it("clicar de novo na marca escolhida tira a marca", () => {
    render(<Tela itens={[{ ...ITEM, visual: "A" }]} />);
    fireEvent.click(screen.getByLabelText("Item 1, Visual: A"));
    expect(ultimo.itens[0].visual).toBe("");
  });

  it("editar um campo do item grava", () => {
    render(<Tela />);
    fireEvent.change(screen.getByLabelText("Item 1, Item da NF"), { target: { value: "3" } });
    expect(ultimo.itens[0].itemNf).toBe("3");
  });

  it("incluir item à mão e remover", () => {
    render(<Tela />);
    fireEvent.click(screen.getByText("Incluir item à mão"));
    expect(ultimo.itens).toHaveLength(2);
    expect(ultimo.itens[1].descricao).toBe("");
    fireEvent.click(screen.getByLabelText("Remover item 1"));
    expect(ultimo.itens).toHaveLength(1);
    expect(ultimo.itens[0].docId).toBeFalsy();
  });

  it("incluir mais certificados do CMR", async () => {
    render(<Tela />);
    fireEvent.click(screen.getByText("Incluir certificados do CMR"));
    fireEvent.click(await screen.findByLabelText("Escolher R261999"));
    fireEvent.click(screen.getByText("Incluir 1 certificado(s)"));
    expect(ultimo.itens.map((i) => i.r)).toEqual(["261266", "261999"]);
    expect(ultimo.itens[1]).toMatchObject({ docId: "d9", certificado: "202600150", visual: "" });
    expect(ultimo.itens[1].temPdf).toBeUndefined(); // só os campos do item
  });

  it("o que falta para assinar aparece", () => {
    render(<Tela />);
    const caixa = screen.getByText(/Para enviar para assinatura falta/).closest("div");
    expect(within(caixa).getByText(/itens: 1/)).toBeTruthy();
  });
});
