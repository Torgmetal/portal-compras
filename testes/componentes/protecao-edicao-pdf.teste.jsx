// @vitest-environment jsdom
// "AS INFORMAÇÕES ADICIONADAS NÃO ESTÃO INDO PARA O PDF" (Vitor, 23/09/2026). O "Abrir PDF" abre em
// outra aba o documento GRAVADO; preenchido e não salvo, o PDF saía sem nada do que se acabou de pôr
// — e a proteção de edição deixava passar justamente os links de nova aba.
import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import ProtecaoEdicao from "@/components/qualidade/ProtecaoEdicao";

let aba;
beforeEach(() => {
  globalThis.React = React;
  aba = { location: { href: "" }, close: vi.fn(), opener: {} };
  vi.stubGlobal("open", vi.fn(() => aba));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Tela({ salvar }) {
  const [valor, setValor] = useState("");
  const [versao, setVersao] = useState(0);
  // como na tela de verdade: o `salvar` de cada render grava o valor DAQUELE render
  const gravar = async () => { const ok = await salvar(valor); if (ok === true) setVersao((v) => v + 1); return ok; };
  return (
    <>
      <ProtecaoEdicao conteudo={{ valor }} versaoSalva={versao} salvar={gravar} salvando={false} />
      <input aria-label="EPS" value={valor} onChange={(e) => setValor(e.target.value)} />
      <a href="/api/qualidade/inspecoes/r1/pdf" target="_blank" rel="noopener noreferrer" data-salvar-antes>Abrir PDF</a>
    </>
  );
}

it("com alteração pendente, grava primeiro e só então abre o PDF", async () => {
  const ordem = [];
  const salvar = vi.fn(async () => { ordem.push("salvou"); return true; });
  vi.stubGlobal("open", vi.fn(() => { ordem.push("abriu aba"); return aba; }));
  render(<Tela salvar={salvar} />);
  fireEvent.change(screen.getByLabelText("EPS"), { target: { value: "EPS 002/2025" } });
  fireEvent.click(screen.getByText("Abrir PDF"));
  await waitFor(() => expect(aba.location.href).toContain("/api/qualidade/inspecoes/r1/pdf"));
  expect(salvar).toHaveBeenCalledTimes(1);
  // a aba abre no TOQUE (senão o navegador bloqueia como pop-up) e só recebe o PDF depois de gravar
  expect(ordem).toEqual(["abriu aba", "salvou"]);
});

it("grava o que está na tela AGORA, não o que havia quando a primeira tecla sujou o formulário", async () => {
  const gravados = [];
  const salvar = vi.fn(async (v) => { gravados.push(v); return true; });
  render(<Tela salvar={salvar} />);
  fireEvent.change(screen.getByLabelText("EPS"), { target: { value: "E" } });
  fireEvent.change(screen.getByLabelText("EPS"), { target: { value: "EPS 002/2025" } });
  fireEvent.click(screen.getByText("Abrir PDF"));
  await waitFor(() => expect(gravados).toEqual(["EPS 002/2025"]));
});

it("se a gravação falhar, a aba em branco fecha e o PDF velho não abre", async () => {
  const salvar = vi.fn(async () => undefined);
  render(<Tela salvar={salvar} />);
  fireEvent.change(screen.getByLabelText("EPS"), { target: { value: "x" } });
  fireEvent.click(screen.getByText("Abrir PDF"));
  await waitFor(() => expect(aba.close).toHaveBeenCalled());
  expect(aba.location.href).toBe("");
});

it("sem alteração pendente, o link abre normalmente — nada é gravado", () => {
  const salvar = vi.fn(async () => true);
  render(<Tela salvar={salvar} />);
  fireEvent.click(screen.getByText("Abrir PDF"));
  expect(salvar).not.toHaveBeenCalled();
});
