// @vitest-environment jsdom
// O Planejamento precisa poder tirar da fila a marca que não deveria estar lá — pedido do Vitor
// (17/09/2026) depois da OP-83, onde a lista corrigida entrou sob outra chave e as marcas antigas
// continuaram aparecendo, duplicadas.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import MontagemConjuntos from "@/app/planejamento/datas-setor/MontagemConjuntos";

const conj = (id, marca, opNumero) => ({
  id, marca, opNumero, descricao: "VIGA", qte: 2, pesoTotalKg: 100,
  status: "PENDENTE", montagemDiaProgramado: null, liberadaParaPcp: false,
  prontidao: { pronto: false, liberavel: false, atendidos: 0, total: 2, pct: 0 },
});

// a mesma marca duas vezes: a linha antiga na frente "T83A" e a nova na chave "083"
const RESPOSTA = {
  conjuntos: [conj("a1", "T83A39", "T83A"), conj("a2", "T83A39", "083"), conj("b1", "T83B7", "083")],
  montados: {}, motivos: {},
};

let chamadas;
beforeEach(() => {
  chamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
    chamadas.push({ url: String(url), metodo: opts?.metodo || opts?.method || "GET", body: opts?.body ? JSON.parse(opts.body) : null });
    if (String(url).includes("/api/producao/pecas")) return { ok: true, json: async () => ({ ok: true, removidas: 1, lotesAfetados: 2 }) };
    return { ok: true, json: async () => RESPOSTA };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("marca repetida na obra aparece sinalizada, e a única não", async () => {
  render(<MontagemConjuntos opId="op83" />);
  await waitFor(() => expect(screen.getAllByText("T83A39")).toHaveLength(2));
  // as duas linhas da marca repetida levam o selo; a T83B7 não
  expect(screen.getAllByText("repetida")).toHaveLength(2);
  expect(screen.getByText("T83B7")).toBeTruthy();
});

it("excluir pede confirmação, manda os ids e avisa sobre lote liberado", async () => {
  render(<MontagemConjuntos opId="op83" />);
  await waitFor(() => expect(screen.getAllByText("T83A39")).toHaveLength(2));

  // sem seleção o botão nem existe
  expect(screen.queryByText(/excluir .* da obra/)).toBeNull();

  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.click(screen.getByText(/excluir 1 da obra/));

  // a confirmação mostra a marca COM a chave, que é o que distingue a duplicada
  expect(screen.getByText(/Excluir 1 marca\(s\) desta obra\?/)).toBeTruthy();
  expect(screen.getByText(/· T83A/)).toBeTruthy();

  fireEvent.click(screen.getByText("excluir", { selector: "button" }));
  await waitFor(() => expect(screen.getByText(/1 marca\(s\) removida\(s\)/)).toBeTruthy());

  const del = chamadas.find((c) => c.url.includes("/api/producao/pecas"));
  expect(del.metodo).toBe("DELETE");
  expect(del.body).toEqual({ ids: ["a1"] });
  // o aviso de lote já liberado tem de aparecer — apagar peça corta a programação do PCP
  expect(screen.getByText(/2 lote\(s\) já liberado\(s\)/)).toBeTruthy();
});

it("cancelar não chama a exclusão", async () => {
  render(<MontagemConjuntos opId="op83" />);
  await waitFor(() => expect(screen.getAllByText("T83A39")).toHaveLength(2));
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.click(screen.getByText(/excluir 1 da obra/));
  fireEvent.click(screen.getByText("cancelar"));
  expect(screen.queryByText(/Excluir 1 marca/)).toBeNull();
  expect(chamadas.some((c) => c.url.includes("/api/producao/pecas"))).toBe(false);
});
