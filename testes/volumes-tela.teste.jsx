// @vitest-environment jsdom
// OP-112 (01/10/2026): a barra ficou um minuto parada em "0 / 264" — cada volume leva ~1 min e a
// tela só se atualizava quando ele terminava. Pareceu travado, alguém pediu de novo e o Volume 3 foi
// montado duas vezes. Agora o servidor diz o que está montando, a tela mostra o tempo correndo, e
// quem chega com a geração em andamento noutra janela só acompanha.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import Volumes from "@/app/qualidade/data-books/[id]/Volumes";

const geracao = { status: "GERANDO", etapa: "Montando o volume 03 — a partir do anexo 131 de 264", cursor: 130, totalItens: 264, paginas: 144, pendencias: [] };
const estado = { geracao, volumes: [], totais: { paginas: 0, tamanho: 0 }, revisao: 0 };
const json = (b, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => b });
const ehServidor = (url, init) => init?.method === "POST" && String(url).endsWith("/gerar/servidor");

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

// avança o relógio falso aos poucos, deixando as promessas da tela andarem entre um passo e outro
async function passar(ms) { for (let t = 0; t < ms; t += 500) await act(async () => { vi.advanceTimersByTime(500); }); }

// ⚠ 15/10/2026 (OP-094): quem monta os volumes passou a ser o SERVIDOR (/gerar/servidor, que continua sozinho). A tela
// dispara e só acompanha — trocar de página no meio não para mais a geração.
describe("volumes do data book na tela", () => {
  it("abriu com geração em andamento: só acompanha (não dispara de novo), avisa que pode sair, e para quando conclui", async () => {
    let n = 0;
    const f = vi.fn((url, init) => (ehServidor(url, init) ? json({ ok: true }) : json(++n > 3 ? { ...estado, geracao: { ...geracao, status: "CONCLUIDO" } } : estado)));
    vi.stubGlobal("fetch", f);
    render(<Volumes id="b112" />);
    expect(await screen.findByText(/continua no servidor: pode sair desta tela/)).toBeTruthy();
    await passar(25_000);
    expect(f.mock.calls.some(([u, i]) => ehServidor(u, i))).toBe(false);
    expect(screen.queryByText(/continua no servidor/)).toBeNull();
  });

  it("gerar dispara o servidor UMA vez e acompanha: a etapa e o tempo correm, a barra não parece travada", async () => {
    const parado = { ...estado, geracao: null, volumes: [{ volume: 1, paginas: 10, tamanho: 1000, url: "u" }] };
    let pediu = false;
    const f = vi.fn((url, init) => {
      if (ehServidor(url, init)) return new Promise(() => {}); // a rodada do servidor demora; a tela não espera
      if (init?.method === "POST") { pediu = true; return json({ ok: true }); }
      return json(pediu ? estado : parado);
    });
    vi.stubGlobal("fetch", f);
    render(<Volumes id="b112" />);
    fireEvent.click(await screen.findByRole("button", { name: /Gerar de novo/ }));
    await passar(12_000);
    expect(screen.getByText(/Montando o volume 03/)).toBeTruthy();
    expect(screen.getByText(/\b1\d s\b/)).toBeTruthy();
    expect(f.mock.calls.filter(([u, i]) => ehServidor(u, i))).toHaveLength(1);
  });
});
