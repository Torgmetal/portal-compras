// @vitest-environment jsdom
// Verificação das travas (02/10/2026): instrumento já escolhido que SAIU da lista (venceu, foi renomeado, ou foi
// marcado em "ver todos") não aparecia para desmarcar, nem no computador nem no celular — o relatório ficava com
// ele para sempre, "VENCIDO" em vermelho no documento. Agora ele aparece marcado no topo da lista.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/campo" }));
import Equipamentos from "@/app/qualidade/inspecoes/[id]/Equipamentos";
import { Equipamentos as EquipamentosCelular } from "@/app/campo/CampoClient";

beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ equipamentos: [{ id: "lx", nome: "LX-01 Luxímetro", certificado: "C-1" }] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const velho = { id: "tm-velho", nome: "TM-99 Termômetro antigo", certificado: "C-9", vencido: true };

it("computador: o instrumento fora da lista aparece marcado e se desmarca", async () => {
  const onMudar = vi.fn();
  render(<Equipamentos escolhidos={[velho]} onMudar={onMudar} tipo="LP" />);
  fireEvent.click(screen.getByRole("button", { name: "trocar" }));
  await waitFor(() => expect(screen.getAllByText("TM-99 Termômetro antigo").length).toBeGreaterThan(1));
  fireEvent.click(screen.getByRole("button", { name: /TM-99 Termômetro antigo/ }));
  expect(onMudar).toHaveBeenCalledWith([]);
});

it("celular: idem", async () => {
  const onMudar = vi.fn();
  render(<EquipamentosCelular escolhidos={[velho]} onMudar={onMudar} tipo="LP" />);
  fireEvent.click(screen.getByRole("button", { name: "trocar" }));
  const botao = await screen.findByRole("button", { name: /TM-99 Termômetro antigo/ });
  fireEvent.click(botao);
  expect(onMudar).toHaveBeenCalledWith([]);
});
