// @vitest-environment jsdom
// O recebimento por certificado no CELULAR (07/10/2026): o inspetor confere cada certificado e marca a
// inspeção visual, dimensional e dos documentos — as mesmas listas e a mesma trava do computador.
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import FormularioRecebimentoRirCampo from "@/app/campo/FormularioRecebimentoRirCampo";
import { condicoesDoRelatorio } from "@/lib/campo-condicoes";

const ITEM = { docId: "d2", r: "260005", descricao: "ARAME TUBULAR METAL CORE 71C - 1,20MM", nf: "73832", certificado: "149793", lote: "SINO250619", quantidade: "500 kg", visual: null, dimensional: null, documentos: null };
const rel = { tipo: "RECEBIMENTO_ARAME", opNumero: "102", createdAt: "2026-10-07T12:00:00Z", resultados: { itens: [ITEM] } };

let cond;
function Tela({ resultado = "APROVADO" }) {
  const [c, setC] = useState(condicoesDoRelatorio(rel.resultados));
  cond = c;
  return <FormularioRecebimentoRirCampo rel={rel} cond={c} setCond={setC} resultado={resultado} observacoes="" />;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ certificados: [
    { docId: "d3", r: "261657", descricao: "ELETRODO 6013 3,25", nf: "30868", certificado: "N/A", lote: "ASMESFA5.01", quantidade: "20", recebidoEm: "2026-09-24", opNumero: null, temPdf: false, pc: "2112", fornecedor: "MIRIMTEC", validade: "", itemNf: "", visual: "", dimensional: "", documentos: "", rnc: "", norma: "" },
  ], total: 1, classe: "arames e eletrodos de solda" }) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("recebimento por certificado no celular", () => {
  it("mostra o certificado e marca as três inspeções", () => {
    render(<Tela />);
    expect(screen.getByText("ARAME TUBULAR METAL CORE 71C - 1,20MM")).toBeTruthy();
    expect(screen.getByText(/149793/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Item 1, Visual: A"));
    fireEvent.click(screen.getByLabelText("Item 1, Dimensional: A"));
    fireEvent.click(screen.getByLabelText("Item 1, Documentação: A"));
    expect(cond.itens[0]).toMatchObject({ visual: "A", dimensional: "A", documentos: "A", r: "260005" });
    expect(screen.getByText(/Tudo o que o relatório pede/)).toBeTruthy();
  });

  it("enquanto falta marcar, diz quantas pendências", () => {
    render(<Tela />);
    expect(screen.getByText(/Falta preencher: 1/)).toBeTruthy();
  });

  it("dá para incluir mais um certificado do CMR", async () => {
    render(<Tela />);
    fireEvent.click(screen.getByText("Incluir certificados do CMR"));
    fireEvent.click(await screen.findByLabelText("Escolher R261657"));
    fireEvent.click(screen.getByText("Incluir 1 certificado(s)"));
    expect(cond.itens.map((i) => i.r)).toEqual(["260005", "261657"]);
  });

  it("quantidade e nº da RNC se editam no item", () => {
    render(<Tela />);
    fireEvent.change(screen.getByLabelText("Item 1, Quantidade"), { target: { value: "480 kg" } });
    expect(cond.itens[0].quantidade).toBe("480 kg");
  });
});
