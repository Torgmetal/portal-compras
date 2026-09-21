// @vitest-environment jsdom
// "tire essas peças da página do planejamento pois não estamos conseguindo excluir" — Vitor
// (17/09/2026), sobre 9 croquis órfãos da OP-83 que a tela de Liberar frentes mostrava sem ter
// como tirar.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import LiberarFrentes from "@/app/planejamento/datas-setor/LiberarFrentes";

// mesmo formato que /api/planejamento/liberacao/pecas devolve
const peca = (id, marca) => ({
  id, marca, frente: "T83F", descricao: "CROQUI", natureza: "croqui",
  perfil: "CH8", aco: "A36", comprimentoMm: null, qte: 2, pesoUnitKg: 5, pesoTotalKg: 10,
  pool: null, status: "PENDENTE", statusEstoque: null, maquina: null, prioridade: null,
  corteOrdem: null, cortada: false, feito: 0, aFazer: true,
  temDesenho: false, desenhoForaPadrao: null, desenhoSoEnvio: false, temMaquina: false,
  programadaEm: null,
});

const PECAS = { temLpc: true, pecas: [peca("c1", "T83F-82"), peca("c2", "T83F-84")], materiais: [] };
const LIB = { frentes: [], datasSetor: [], setores: [{ key: "CORTE", label: "Corte" }] };

let chamadas;
beforeEach(() => {
  chamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
    const u = String(url);
    chamadas.push({ url: u, metodo: opts?.method || "GET", body: opts?.body ? JSON.parse(opts.body) : null });
    if (u.includes("/api/producao/pecas")) return { ok: true, json: async () => ({ ok: true, removidas: 2, lotesAfetados: 0 }) };
    if (u.includes("/liberacao/pecas")) return { ok: true, json: async () => PECAS };
    return { ok: true, json: async () => LIB };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function selecionarTudo() {
  render(<LiberarFrentes opId="op83" opNumero="083" />);
  await waitFor(() => expect(screen.getByText("T83F-82")).toBeTruthy());
  // ⚠ os primeiros checkboxes são os FILTROS da tela; o da linha é o último
  const caixas = screen.getAllByRole("checkbox");
  fireEvent.click(caixas[caixas.length - 1]);
  await waitFor(() => expect(screen.getByText("excluir")).toBeTruthy());
}

it("com peça selecionada aparece excluir, que pede confirmação e manda os ids", async () => {
  await selecionarTudo();
  fireEvent.click(screen.getByText("excluir"));
  expect(screen.getByText(/Excluir .* peça\(s\) desta obra\?/)).toBeTruthy();

  const botoes = screen.getAllByText("excluir", { selector: "button" });
  fireEvent.click(botoes[botoes.length - 1]);

  await waitFor(() => {
    const del = chamadas.find((c) => c.url.includes("/api/producao/pecas"));
    expect(del).toBeTruthy();
    expect(del.metodo).toBe("DELETE");
    expect(Array.isArray(del.body.ids)).toBe(true);
  });
});

it("peça SEM desenho e SEM NC1 pode ser marcada — é ela que precisa ser excluída", async () => {
  // ⚠ o caso do Geraldo e do Gabriel (18/09/2026): os croquis órfãos da OP-83 não têm desenho nem
  // NC1, e o checkbox vinha desabilitado, então não dava para selecioná-los para excluir.
  render(<LiberarFrentes opId="op83" opNumero="083" />);
  await waitFor(() => expect(screen.getByText("T83F-82")).toBeTruthy());
  const caixas = screen.getAllByRole("checkbox");
  const daLinha = caixas[caixas.length - 1];
  expect(daLinha.disabled).toBe(false);
  fireEvent.click(daLinha);
  await waitFor(() => expect(screen.getByText("excluir")).toBeTruthy());
});

it("liberar ao PCP continua recusando peça sem desenho", async () => {
  render(<LiberarFrentes opId="op83" opNumero="083" />);
  await waitFor(() => expect(screen.getByText("T83F-82")).toBeTruthy());
  const caixas = screen.getAllByRole("checkbox");
  fireEvent.click(caixas[caixas.length - 1]);
  await waitFor(() => expect(screen.getByText("excluir")).toBeTruthy());

  const liberar = screen.getAllByRole("button").find((b) => /liberar/i.test(b.textContent));
  expect(liberar).toBeTruthy();
  fireEvent.click(liberar);

  await waitFor(() => expect(screen.getByText(/não descem para o PCP/)).toBeTruthy());
  // e nada foi mandado para a rota de liberação
  expect(chamadas.some((c) => c.url.endsWith("/api/planejamento/liberacao") && c.metodo === "POST")).toBe(false);
});

it("cancelar fecha a confirmação sem excluir nada", async () => {
  await selecionarTudo();
  fireEvent.click(screen.getByText("excluir"));
  fireEvent.click(screen.getByText("cancelar"));
  await waitFor(() => expect(screen.queryByText(/Excluir .* peça\(s\) desta obra\?/)).toBeNull());
  expect(chamadas.some((c) => c.url.includes("/api/producao/pecas"))).toBe(false);
});
