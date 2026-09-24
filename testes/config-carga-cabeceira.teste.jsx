// @vitest-environment jsdom
//
// A altura da cabeceira é premissa da Expedição, não do código: a tela de veículos do simulador mostra o campo e o
// manda ao salvar. Vitor (24/09/2026): "usamos carretas graneleiras" — o padrão é 1,8 m (tampas 800 + 1.000 mm), e a
// medida real da carreta entra aqui. Sem este campo, a regra do travamento (lib/carga/travamento.js) ficaria presa a
// uma premissa que ninguém de fora do código consegue corrigir.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import ConfigCargaSection from "@/app/planejamento/config-expedicao/ConfigCargaSection";
import { linhasDeConfiguracao } from "@/lib/carga/config-carga";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("tela de veículos do simulador — cabeceira", () => {
  it("mostra a cabeceira de cada veículo e manda o valor editado ao salvar", async () => {
    const linhas = linhasDeConfiguracao(null), puts = [];
    vi.stubGlobal("fetch", vi.fn(async (url, op) => {
      if (op?.method === "PUT") { puts.push(JSON.parse(op.body)); return { ok: true, json: async () => ({ success: true, veiculos: linhas, atualizadoEm: null }) }; }
      return { ok: true, json: async () => ({ success: true, veiculos: linhas, atualizadoEm: null }) };
    }));
    render(<ConfigCargaSection />);
    expect(await screen.findByText("Cabeceira (mm)")).toBeTruthy();
    const linhaCarreta = screen.getByDisplayValue("Carreta graneleira 3 eixos").closest("tr");
    const campo = [...linhaCarreta.querySelectorAll("input[type=number]")].find((i) => i.value === "1800");
    expect(campo).toBeTruthy();
    fireEvent.change(campo, { target: { value: "2000" } });
    fireEvent.click(screen.getByText("Salvar veículos"));
    await waitFor(() => expect(puts).toHaveLength(1));
    const enviados = Object.fromEntries(puts[0].veiculos.map((v) => [v.chave, v]));
    expect(enviados.carreta.cabeceira).toBe(2000);
    expect(enviados.truck.cabeceira).toBe(0); // em branco = não informada
  });
});
