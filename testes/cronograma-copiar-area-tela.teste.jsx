// @vitest-environment jsdom
// A janela "Copiar área" do cronograma (OP-118, 09/10/2026): escolher as áreas de destino, que já estão
// cadastradas, e copiar as tarefas da área de origem com as datas.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModalCopiarArea } from "@/app/planejamento/cronogramas/_componentes/ModalCopiarArea";

const AREAS = [{ nome: "A", cor: 0 }, { nome: "Romaneio 01", cor: 1 }, { nome: "B", cor: 2 }, { nome: "C", cor: 3 }];
const tarefa = (area, nome) => ({ id: `${area}-${nome}`, area, nome, departamento: "FABRICACAO", isSummary: false });
const TAREFAS = [tarefa("A", "Preparação"), tarefa("A", "Montagem"), tarefa("C", "Preparação")];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, porDestino: { B: 2 }, criadas: 2 }) });
  vi.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const abrir = (extra = {}) => {
  const props = { cronogramaId: "c118", dept: "FABRICACAO", origem: "A", areas: AREAS, tarefasDoSetor: TAREFAS, onFechar: vi.fn(), onCopiado: vi.fn(), ...extra };
  render(<ModalCopiarArea {...props} />);
  return props;
};

describe("janela copiar área", () => {
  it("lista as outras áreas cadastradas; a que já tem tarefas no setor fica bloqueada", () => {
    abrir();
    expect(screen.getByText(/2 tarefas da área A/)).toBeTruthy();
    expect(screen.getByLabelText("Copiar para B").disabled).toBe(false);
    expect(screen.getByLabelText("Copiar para Romaneio 01").disabled).toBe(false);
    expect(screen.getByLabelText("Copiar para C").disabled).toBe(true);
    expect(screen.getByText(/já tem 1 tarefa/)).toBeTruthy();
    expect(screen.queryByLabelText("Copiar para A")).toBeNull();
  });

  it("copia para as áreas marcadas e atualiza a tela", async () => {
    const p = abrir();
    fireEvent.click(screen.getByLabelText("Copiar para B"));
    fireEvent.click(screen.getByLabelText("Copiar para Romaneio 01"));
    fireEvent.click(screen.getByText("Copiar para 2 áreas"));
    await waitFor(() => expect(p.onCopiado).toHaveBeenCalled());
    const [url, op] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/planejamento/cronogramas/c118/areas");
    expect(JSON.parse(op.body)).toEqual({ acao: "copiar", origem: "A", departamento: "FABRICACAO", destinos: ["Romaneio 01", "B"], manterExternas: true });
    expect(p.onFechar).toHaveBeenCalled();
  });

  it("dá para não levar os vínculos de fora da área", async () => {
    const p = abrir();
    fireEvent.click(screen.getByLabelText("Copiar para B"));
    fireEvent.click(screen.getByLabelText(/Manter as vinculações com tarefas de fora da área/));
    fireEvent.click(screen.getByText("Copiar para 1 área"));
    await waitFor(() => expect(p.onCopiado).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).manterExternas).toBe(false);
  });

  it("sem destino marcado o botão fica parado", () => {
    abrir();
    expect(screen.getByText("Copiar para 0 áreas").closest("button").disabled).toBe(true);
  });

  it("erro do servidor aparece na janela", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: "A área B já tem tarefas neste setor" }) });
    const p = abrir();
    fireEvent.click(screen.getByLabelText("Copiar para B"));
    fireEvent.click(screen.getByText("Copiar para 1 área"));
    expect(await screen.findByText(/B já tem tarefas/)).toBeTruthy();
    expect(p.onCopiado).not.toHaveBeenCalled();
  });
});
