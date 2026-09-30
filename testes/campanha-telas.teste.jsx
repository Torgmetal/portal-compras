// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
const nav = vi.hoisted(() => ({ path: "/entrar" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
vi.mock("next/image", () => ({ default: (p) => <img {...p} /> }));
vi.mock("@/components/TorgLogo", () => ({ default: () => <span>Torg</span> }));
import WorkspaceAcesso from "@/components/WorkspaceAcesso";
import FaixaCampanha from "@/components/FaixaCampanha";
import SeloCampanha from "@/components/SeloCampanha";

// Vitor (30/09/2026): "no dia 01/10 já mude, tem que ser horário de Brasília". As telas trocam sozinhas
// pela data; a prévia (?campanha=outubro-rosa) deixa validar antes.

const em = (iso) => vi.setSystemTime(new Date(iso));
const lacoDoLogin = () => document.querySelector("header img:not([src$='.svg'])");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  sessionStorage.clear();
  window.history.replaceState({}, "", "/entrar");
  nav.path = "/entrar";
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("tela de entrada", () => {
  it("em 30/09 (Brasília) ainda é o laço do Setembro Amarelo", () => {
    em("2026-10-01T02:30:00Z"); // 23h30 de 30/09 em Brasília
    render(<WorkspaceAcesso><p>login</p></WorkspaceAcesso>);
    expect(lacoDoLogin().getAttribute("src")).toBe("/campanhas/setembro-amarelo/laco.png");
  });

  it("à 00h de 01/10 (Brasília) já é o laço do Outubro Rosa", () => {
    em("2026-10-01T03:00:00Z");
    render(<WorkspaceAcesso><p>login</p></WorkspaceAcesso>);
    expect(lacoDoLogin().getAttribute("src")).toBe("/campanhas/outubro-rosa/laco.png");
    expect(lacoDoLogin().getAttribute("alt")).toBe("Outubro Rosa");
  });

  it("fora de campanha, sem laço", () => {
    em("2026-11-15T15:00:00Z");
    render(<WorkspaceAcesso><p>login</p></WorkspaceAcesso>);
    expect(lacoDoLogin()).toBeNull();
  });

  it("a prévia ?campanha=outubro-rosa mostra o Outubro Rosa ainda em setembro", async () => {
    em("2026-09-30T15:00:00Z");
    window.history.replaceState({}, "", "/entrar?campanha=outubro-rosa");
    render(<WorkspaceAcesso><p>login</p></WorkspaceAcesso>);
    await waitFor(() => expect(lacoDoLogin().getAttribute("src")).toBe("/campanhas/outubro-rosa/laco.png"));
  });
});

describe("telas do cliente", () => {
  it("a faixa de outubro diz Outubro Rosa e o slogan, com a cor da campanha", () => {
    em("2026-10-05T15:00:00Z");
    nav.path = "/fornecedores/c/abc";
    const { container } = render(<FaixaCampanha />);
    expect(screen.getByText("Outubro Rosa")).toBeTruthy();
    expect(container.textContent).toContain("A Torg Metal apoia a prevenção do câncer de mama.");
    expect(container.firstChild.style.background).toBeTruthy();
  });

  it("a faixa não aparece no portal interno", () => {
    em("2026-10-05T15:00:00Z");
    nav.path = "/compras";
    const { container } = render(<FaixaCampanha />);
    expect(container.firstChild).toBeNull();
  });

  it("o selo do portal da obra traz o nome e o slogan do mês", () => {
    em("2026-10-05T15:00:00Z");
    render(<SeloCampanha />);
    expect(screen.getByText("Outubro Rosa")).toBeTruthy();
    expect(screen.getByText("A Torg Metal apoia a prevenção do câncer de mama.")).toBeTruthy();
  });
});
