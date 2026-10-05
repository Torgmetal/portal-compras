// @vitest-environment jsdom
// ⚠⚠ Achado do Codex (05/10/2026): resposta perdida → o operador altera uma linha → 409 → a tela
// trocava a chave e deixava a prévia de pé, e o clique seguinte gravava como NOVO o que já estava
// gravado. A sequência inteira, no componente, sem nenhum R a mais.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const showToast = vi.fn();
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast }) }));
import CmrLancarClient from "@/app/compras/recebimento-cmr/CmrLancarClient";

let posts;
beforeEach(() => {
  posts = [];
  showToast.mockClear();
  global.fetch = vi.fn(async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith("/api/compras/cmr?")) return { ok: true, status: 200, json: async () => ({ success: true, itens: [], total: 0, anos: [2026] }) };
    if (u === "/api/compras/cmr" && opts.method === "POST") {
      posts.push(JSON.parse(opts.body));
      // 1ª: a Vercel derruba a função depois do commit; 2ª: o conteúdo mudou → conflito
      if (posts.length === 1) return { ok: false, status: 504, text: async () => "An error occurred with your deployment" };
      return { ok: false, status: 409, text: async () => JSON.stringify({ error: "Este lote já foi gravado com outro conteúdo.", indices: ["261832"] }) };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
  });
});
afterEach(cleanup);

it("resposta perdida → linha alterada → 409: a prévia sai da tela e não há como regravar", async () => {
  render(<CmrLancarClient />);
  fireEvent.click(screen.getByRole("button", { name: /Colar várias linhas/ }));
  fireEvent.change(screen.getByPlaceholderText(/Cole aqui/), { target: { value: "R\t\tARRUELA 5/8\t\t\t\t2054" } });
  fireEvent.click(await screen.findByRole("button", { name: /Gravar 1/ }));
  await waitFor(() => expect(posts).toHaveLength(1));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/pode ter sido gravado/), "erro"));

  // o operador "corrige" uma linha da prévia e tenta de novo
  fireEvent.change(screen.getByDisplayValue("ARRUELA 5/8"), { target: { value: "ARRUELA LISA 5/8" } });
  fireEvent.click(screen.getByRole("button", { name: /Gravar 1/ }));
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1].loteId).toBe(posts[0].loteId);

  await waitFor(() => expect(screen.queryByRole("button", { name: /Gravar/ })).toBeNull());
  expect(showToast).toHaveBeenLastCalledWith(expect.stringMatching(/261832/), "erro");
  expect(posts).toHaveLength(2);
});
