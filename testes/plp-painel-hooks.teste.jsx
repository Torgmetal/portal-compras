// @vitest-environment jsdom
// "Algo deu errado" na tela do relatório de pintura (Vitor, 15/09/2026): o PlpPainel chamava um hook
// DEPOIS do return de "carregando o PLP…" — quando o PLP chegava, o React contava um hook a mais
// ("Rendered more hooks than during the previous render") e a tela inteira caía no erro.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import PlpPainel from "@/app/qualidade/inspecoes/[id]/PlpPainel";

beforeEach(() => { globalThis.React = React; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("sai do 'carregando' para o PLP carregado sem mudar a ordem dos hooks", async () => {
  const erros = [];
  vi.spyOn(console, "error").mockImplementation((...a) => erros.push(a.join(" ")));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ plp: null, tintas: [], temPlp: false }) })));
  render(<PlpPainel opNumero="103" podeEditar res={{}} setResultado={() => {}} />);
  expect(screen.getByText(/carregando o PLP/)).toBeTruthy();
  await waitFor(() => expect(screen.queryByText(/carregando o PLP/)).toBeNull());
  expect(erros.filter((e) => /more hooks|Rendered/.test(e))).toEqual([]);
  expect(screen.getByText(/Plano de Pintura/)).toBeTruthy();
});
