// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { VolumesDaCarga } from "@/components/carga/ResultadoSimulacao";

const carga = {
  itens: [{ id: "v1", camada: 0, membros: [{ marca: "T122-V01", desc: "Viga principal" }] }, { id: "v2", camada: 1, membros: [{ marca: "T122-C02", desc: "Coluna lateral" }] }],
  romaneio: [{ id: "v1", volume: 1, tipo: "feixe cintado", marcas: ["T122-V01"], pecas: 1, kgBruto: 150, dimsCm: [600, 30, 50] }, { id: "v2", volume: 2, tipo: "peça solta calçada", marcas: ["T122-C02"], pecas: 1, kgBruto: 200, dimsCm: [500, 30, 30] }],
};
beforeEach(() => { globalThis.React = React; });
afterEach(cleanup);
it("encontra o volume pela marca sem alterar a carga e permite ajustar a peça encontrada", () => {
  const ajustar = vi.fn();
  render(<VolumesDaCarga carga={carga} onAjustar={ajustar} />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar volume ou marca" }), { target: { value: "t122-c02" } });
  expect(screen.queryByText("T122-V01")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "T122-C02" }));
  expect(ajustar).toHaveBeenCalledWith("T122-C02", "Coluna lateral");
  expect(carga.romaneio).toHaveLength(2);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "inexistente" } });
  expect(screen.getByText("Nenhum volume encontrado.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
  expect(screen.getByText("T122-V01")).toBeTruthy();
});
