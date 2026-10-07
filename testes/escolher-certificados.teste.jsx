// @vitest-environment jsdom
// O seletor de certificados do CMR, usado na criação dos recebimentos no computador e no celular
// (Vitor, 07/10/2026: "selecionar apenas os certificados", sem peças).
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import EscolherCertificados from "@/components/qualidade/EscolherCertificados";

const cert = (docId, descricao, extra = {}) => ({ docId, r: `R${docId}`, descricao, nf: "17819", certificado: `C-${docId}`, lote: `L-${docId}`, quantidade: "20", recebidoEm: "2026-09-01", opNumero: "102", temPdf: true, ...extra });
const LISTA = [cert("5", "TINTA INDUSTHANE RHB 650"), cert("6", "ENDURECEDOR PARA INDUSTHANE"), cert("7", "DILUENTE ACR 34.019"), cert("8", "TINTA INDUSDUR HB")];

function Tela({ tipo = "RECEBIMENTO_TINTA", onChange = () => {} }) {
  const [sel, setSel] = useState([]);
  return <EscolherCertificados tipo={tipo} opNumero="102" selecionados={sel} onChange={(l) => { setSel(l); onChange(l); }} />;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ certificados: LISTA, total: 4, classe: "tintas, endurecedores e diluentes" }) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("seletor de certificados", () => {
  it("busca no CMR pelo tipo e pela obra e lista os certificados", async () => {
    render(<Tela />);
    expect(await screen.findByText("TINTA INDUSTHANE RHB 650")).toBeTruthy();
    expect(global.fetch.mock.calls[0][0]).toBe("/api/qualidade/inspecoes/certificados?tipo=RECEBIMENTO_TINTA&opNumero=102&q=");
    expect(screen.getByText(/tintas, endurecedores e diluentes/)).toBeTruthy();
  });

  it("marcar escolhe; no recebimento de tintas mostra a posição (A, B, C) e para em três", async () => {
    const onChange = vi.fn();
    render(<Tela onChange={onChange} />);
    for (const n of ["Escolher R7", "Escolher R5", "Escolher R6"]) fireEvent.click(await screen.findByLabelText(n));
    expect(onChange.mock.calls.at(-1)[0].map((c) => c.docId)).toEqual(["7", "5", "6"]);
    expect(screen.getByText("C · DILUENTE ACR 34.019")).toBeTruthy();
    expect(screen.getByText("A · TINTA INDUSTHANE RHB 650")).toBeTruthy();
    expect(screen.getByLabelText("Escolher R8").disabled).toBe(true);
    expect(screen.getByText(/máximo de 3/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Tirar R5"));
    expect(onChange.mock.calls.at(-1)[0].map((c) => c.docId)).toEqual(["7", "6"]);
  });

  it("digitar busca de novo com o texto", async () => {
    render(<Tela tipo="RECEBIMENTO_PENETRANTE" />);
    await screen.findByText("TINTA INDUSTHANE RHB 650");
    fireEvent.change(screen.getByLabelText("Buscar certificado no CMR"), { target: { value: "d-70" } });
    await waitFor(() => expect(global.fetch.mock.calls.at(-1)[0]).toContain("q=d-70"), { timeout: 2000 });
  });

  it("sem resultado diz como achar — e lembra que dá para incluir à mão depois", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ certificados: [], total: 0, classe: "penetrante, revelador e removedor" }) });
    render(<Tela tipo="RECEBIMENTO_PENETRANTE" />);
    expect(await screen.findByText(/Nenhum certificado/)).toBeTruthy();
    expect(screen.getByText(/incluir à mão/)).toBeTruthy();
  });

  it("erro na busca aparece com tentar de novo", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Falha no CMR" }) });
    render(<Tela />);
    expect(await screen.findByText(/Falha no CMR/)).toBeTruthy();
    fireEvent.click(screen.getByText("Tentar novamente"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
