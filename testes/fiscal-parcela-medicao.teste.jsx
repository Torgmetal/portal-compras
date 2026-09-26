// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ParcelaMedicao from "@/app/fiscal/inteligencia/ParcelaMedicao";

const ITENS = [
  { item: 1, descricao: "Treliça", ncm: "84313900", cfop: "6101", quantidade: 100, valor: 1000 },
  { item: 2, descricao: "Apoio", ncm: "73089010", cfop: "6101", quantidade: 10, valor: 500 },
];
afterEach(() => cleanup());

describe("ParcelaMedicao", () => {
  it("manda só os marcados, com a quantidade digitada", () => {
    const onAuditar = vi.fn();
    render(<ParcelaMedicao itens={ITENS} onAuditar={onAuditar} />);
    fireEvent.click(screen.getByLabelText("Incluir item 2"));
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "25" } });
    expect(screen.getAllByText(/250,00/)).toHaveLength(2); // a linha e o total da parcela
    fireEvent.click(screen.getByRole("button", { name: /Auditar parcela/ }));
    expect(onAuditar).toHaveBeenCalledWith([{ item: 1, quantidade: 25 }]);
  });

  it("⚠ quantidade acima do pedido trava o botão e avisa", () => {
    render(<ParcelaMedicao itens={ITENS} onAuditar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "101" } });
    expect(screen.getByRole("alert").textContent).toMatch(/no máximo a do pedido/);
    expect(screen.getByRole("button", { name: /Auditar parcela/ }).disabled).toBe(true);
  });

  it("⚠ quantidade com decimal vem cheia e VÁLIDA (1803.7 não pode virar 18037)", () => {
    const onAuditar = vi.fn();
    render(<ParcelaMedicao itens={[{ item: 2, descricao: "Pilaretes", ncm: "94069020", cfop: "5101", quantidade: 1803.7, valor: 18037 }]} onAuditar={onAuditar} />);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Auditar parcela/ }));
    expect(onAuditar).toHaveBeenCalledWith([{ item: 2, quantidade: 1803.7 }]);
  });

  it("nenhum item marcado trava o botão", () => {
    render(<ParcelaMedicao itens={ITENS} onAuditar={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Incluir item 1"));
    fireEvent.click(screen.getByLabelText("Incluir item 2"));
    expect(screen.getByRole("button", { name: /Auditar parcela/ }).disabled).toBe(true);
  });

  it("mostra deveria-ser × pedido e marca a divergência de IPI", () => {
    render(<ParcelaMedicao itens={ITENS} onAuditar={vi.fn()}
      esperados={[{ item: 1, noPedido: { ipi: { aliquota: 0 }, icms: { aliquota: 12 } }, receitaCasada: "Fab",
        linhas: [{ tributo: "IPI", cadastrado: 0, regra: 5, valor: 12.5, divergente: true }, { tributo: "ICMS", cadastrado: 12, regra: 12, valor: 30, divergente: false }] }]}
      totais={[{ tributo: "IPI", valor: 12.5 }]} />);
    expect(screen.getAllByLabelText("diverge")).toHaveLength(1);
    expect(screen.getByText(/Total da parcela por tributo/).parentElement.textContent).toMatch(/IPI R\$\s?12,50/);
  });
});
