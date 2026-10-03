// @vitest-environment jsdom
// Matheus (03/10/2026): "uma aba simplificada para os setores corte e montagem — os gerentes
// selecionam a OBRA e depois o setor e verificam o status; o status da peça, os croquis, quantos já
// foram cortados, quantos faltam; e deixe bom para ver no celular".
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import CorteMontagemClient from "@/app/producao/corte-montagem/CorteMontagemClient";

const OPS = { ops: [{ opId: "op124", opNumero: "124", cliente: "MARKO", obra: "Center Norte" }, { opId: "op120", opNumero: "120", cliente: "TMSA", obra: "BIANCHINI" }] };
const MONTAGEM = { pecas: [
  { id: "a", marca: "T124A1", descricao: "PL2-1", qte: 1, totalCroquis: 6, prontoMontar: false,
    faltamCroquis: [{ marca: "T124A1-P1", descricao: "PL 12.5", faltaQtd: 2, qtd: 4 }] },
  { id: "b", marca: "T124A2", descricao: "CS2-4", qte: 2, produzidoSyneco: 2, totalCroquis: 2, prontoMontar: true, faltamCroquis: [] },
  { id: "c", marca: "T124A3", descricao: "CS2-5", qte: 2, totalCroquis: 3, prontoMontar: true, faltamCroquis: [] },
] };
const CORTE = { pecas: [
  { id: "p1", marca: "T124A1-P1", descricao: "PL 12.5", qte: 4, produzidoSyneco: 2 },
  { id: "p2", marca: "T124A1-P2", descricao: "PL 8", qte: 3, produzidoSyneco: 3 },
] };

beforeEach(() => {
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    const corpo = u.includes("/api/pcp/producao") ? OPS : u.includes("setor=CORTE") ? CORTE : MONTAGEM;
    return { ok: true, status: 200, json: async () => corpo };
  });
  try { localStorage.clear(); } catch {}
});
afterEach(cleanup);

const escolherObra = async (id = "op124") => {
  render(<CorteMontagemClient />);
  const sel = await screen.findByLabelText("Obra");
  await waitFor(() => expect(sel.querySelectorAll("option").length).toBeGreaterThan(1));
  fireEvent.change(sel, { target: { value: id } });
};

describe("Produção › Corte e montagem", () => {
  it("escolhe a obra e o setor, e busca na mesma rota do PCP", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A1");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/pcp/despacho?opId=op124&setor=MONTAGEM"), expect.anything());
  });

  it("montagem: cada conjunto diz quantos croquis já foram cortados, e toca para ver os que faltam", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    const cartao = (await screen.findByText("T124A1")).closest("li");
    expect(cartao.textContent).toMatch(/não iniciado/);
    fireEvent.click(within(cartao).getByRole("button", { name: /0\/6|5\/6|faltam/ }));
    expect(cartao.textContent).toMatch(/T124A1-P1/);
    expect(cartao.textContent).toMatch(/faltam 2 de 4/);
  });

  it("resumo do topo: situação das peças e conjuntos prontos para montar", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A1");
    const resumo = screen.getByRole("region", { name: "Resumo do setor" });
    expect(resumo.textContent).toMatch(/2\s*não iniciad/);
    expect(resumo.textContent).toMatch(/1\s*pronta/);
    expect(resumo.textContent).toMatch(/1 pronto para montar/); // singular — "5 prontos" no plural
  });

  it("corte: cortado X de Y e quanto falta", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Corte" }));
    const cartao = (await screen.findByText("T124A1-P1")).closest("li");
    expect(cartao.textContent).toMatch(/cortado 2 de 4/);
    expect(cartao.textContent).toMatch(/faltam 2/);
  });

  it("'só o que falta' esconde o que já terminou", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Corte" }));
    await screen.findByText("T124A1-P1");
    expect(screen.getByText("T124A1-P2")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /só o que falta/i }));
    expect(screen.queryByText("T124A1-P2")).toBeNull();
  });

  it("busca por marca", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A1");
    fireEvent.change(screen.getByLabelText("Buscar marca"), { target: { value: "a3" } });
    expect(screen.queryByText("T124A1")).toBeNull();
    expect(screen.getByText("T124A3")).toBeTruthy();
  });

  it("erro ao carregar mostra o motivo e 'Tentar novamente'", async () => {
    await escolherObra();
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "Banco fora" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Banco fora/);
    expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeTruthy();
  });
});
