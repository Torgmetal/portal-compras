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
const ehContinuar = (url, init) => init?.method === "POST" && String(url).endsWith("/continuar");

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("volumes do data book na tela", () => {
  it("outra janela com a vez: a tela não acusa erro, avisa e segue acompanhando", async () => {
    const continuar = vi.fn()
      .mockImplementationOnce(() => json({ ok: true, ocupado: true }))
      .mockImplementationOnce(() => json({ ok: true, concluido: true }));
    vi.stubGlobal("fetch", vi.fn((url, init) => (ehContinuar(url, init) ? continuar() : json(estado))));
    render(<Volumes id="b112" />);
    fireEvent.click(await screen.findByRole("button", { name: /Continuar/ }));
    expect(await screen.findByText(/Outra janela está gerando/)).toBeTruthy();
    expect(screen.queryByText(/Falha/)).toBeNull();
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(continuar).toHaveBeenCalledTimes(2);
  });

  it("enquanto monta, a etapa vem do servidor e o tempo corre — a barra não parece travada", async () => {
    let soltar;
    const demora = new Promise((r) => { soltar = r; });
    const f = vi.fn((url, init) => (ehContinuar(url, init) ? demora.then(() => json({ ok: true, concluido: true })) : json(estado)));
    vi.stubGlobal("fetch", f);
    render(<Volumes id="b112" />);
    fireEvent.click(await screen.findByRole("button", { name: /Continuar/ }));
    await act(async () => { vi.advanceTimersByTime(12_000); });
    expect(screen.getByText(/Montando o volume 03/)).toBeTruthy();
    expect(screen.getByText(/\b1\d s\b/)).toBeTruthy();
    // e consulta o andamento durante a espera, não só quando o volume termina
    const consultas = f.mock.calls.filter(([url, init]) => !init?.method && String(url).endsWith("/gerar")).length;
    expect(consultas).toBeGreaterThan(2);
    soltar();
  });
});
