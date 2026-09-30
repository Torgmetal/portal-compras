// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const nav = vi.hoisted(() => ({ path: "/compras" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
import BannerCampanha from "@/components/BannerCampanha";

// Vitor (30/09/2026): "consegue criar um banner com a informação e uma mensagem para todos que fizerem o
// primeiro acesso, incluindo clientes (…) algo que fale com as pessoas e familiares pois temos homens e
// mulheres na equipe". Aprovou a arte com o laço e pediu para tirar a menção a câncer de mama em homens.

const em = (iso) => vi.setSystemTime(new Date(iso));
const titulo = "Cuidar é um gesto de amor.";

// ⚠ o Node 26 não traz `localStorage`: mesmo stub dos outros testes (minha-fila, toggle-sidebar-mobile)
const guardado = new Map();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  guardado.clear();
  vi.stubGlobal("localStorage", { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, String(v)), removeItem: (k) => guardado.delete(k) });
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  nav.path = "/compras";
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("banner do Outubro Rosa no primeiro acesso", () => {
  it("abre no primeiro acesso de outubro, com a mensagem para mulheres e homens", async () => {
    em("2026-10-01T11:00:00Z");
    render(<BannerCampanha />);
    const dialogo = await screen.findByRole("dialog");
    expect(screen.getByText(titulo)).toBeTruthy();
    expect(dialogo.textContent).toContain("Para as mulheres:");
    expect(dialogo.textContent).toContain("Para os homens:");
    expect(dialogo.textContent).toContain("Cuidar da saúde é cuidar de quem a gente ama.");
  });

  it("não fala em câncer de mama em homens (pedido do Vitor)", async () => {
    em("2026-10-01T11:00:00Z");
    render(<BannerCampanha />);
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo.textContent).not.toMatch(/homens também podem ter/i);
  });

  it("'Entendi' fecha e ele não volta naquele aparelho", async () => {
    em("2026-10-01T11:00:00Z");
    render(<BannerCampanha />);
    fireEvent.click(await screen.findByRole("button", { name: "Entendi" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    render(<BannerCampanha />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc também fecha", async () => {
    em("2026-10-02T11:00:00Z");
    render(<BannerCampanha />);
    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("aparece para o cliente também, com o laço", async () => {
    em("2026-10-03T11:00:00Z");
    nav.path = "/portal/token-da-obra";
    render(<BannerCampanha />);
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo.querySelector("img").getAttribute("src")).toBe("/campanhas/outubro-rosa/laco.png");
  });

  it("não abre em setembro (o Setembro Amarelo não tem banner)", async () => {
    em("2026-09-30T15:00:00Z");
    render(<BannerCampanha />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("não atrapalha tarefa: login, assinatura, ata e a conferência no pátio ficam sem banner", async () => {
    em("2026-10-01T11:00:00Z");
    for (const p of ["/entrar", "/assinar/abc", "/ata/abc", "/data-book/assinar/abc", "/expedicao/conferencia/xyz"]) {
      nav.path = p;
      render(<BannerCampanha />);
      await new Promise((r) => setTimeout(r, 10));
      expect(screen.queryByRole("dialog"), p).toBeNull();
      cleanup();
    }
  });

  it("a prévia (?campanha=outubro-rosa) mostra mesmo em setembro e mesmo já dispensado", async () => {
    em("2026-09-30T15:00:00Z");
    localStorage.setItem("torg:campanha-vista:outubro-rosa:2026", "1");
    window.history.replaceState({}, "", "/compras?campanha=outubro-rosa");
    render(<BannerCampanha />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
