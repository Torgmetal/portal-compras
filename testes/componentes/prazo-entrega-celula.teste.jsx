// @vitest-environment jsdom
// A coluna "Prazo de entrega" da lista de pedidos da OP (Matheus, 02/10/2026) — a mesma data e a
// mesma situação de Prazos das RMs.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import PrazoEntregaCelula from "@/components/PrazoEntregaCelula";

afterEach(cleanup);
const texto = (prazo) => render(<PrazoEntregaCelula prazo={prazo} />).container.textContent;

describe("PrazoEntregaCelula", () => {
  it("⚠ a data sai no DIA gravado — sem voltar um dia pelo fuso de São Paulo", () => {
    expect(texto({ previsao: "2026-10-15", situacao: "NO_PRAZO", diasAte: 13 })).toMatch(/^15\/10\/2026/);
  });

  it("atrasado diz quantos dias", () => {
    expect(texto({ previsao: "2026-10-01", situacao: "ATRASADO", diasAte: -1 })).toMatch(/1 dia de atraso/);
    cleanup();
    expect(texto({ previsao: "2026-09-20", situacao: "ATRASADO", diasAte: -12 })).toMatch(/12 dias de atraso/);
  });

  it("vence hoje, e em N dias", () => {
    expect(texto({ previsao: "2026-10-02", situacao: "VENCE_HOJE", diasAte: 0 })).toMatch(/vence hoje/);
    cleanup();
    expect(texto({ previsao: "2026-10-05", situacao: "PROXIMO", diasAte: 3 })).toMatch(/em 3 dias/);
  });

  it("parcial com o restante atrasado", () => {
    expect(texto({ previsao: "2026-09-20", situacao: "PARCIAL", diasAte: -12 })).toMatch(/parcial · 12 dias de atraso no restante/);
  });

  it("chegou", () => {
    expect(texto({ previsao: "2026-09-20", situacao: "CHEGOU", diasAte: null })).toMatch(/chegou$/);
  });

  it("⚠ encerrado no Omie diz de onde vem a certeza — a coluna Status ainda pode dizer 'Aguardando'", () => {
    expect(texto({ previsao: "2026-09-18", situacao: "CHEGOU", diasAte: null, porEncerramento: true })).toMatch(/chegou · encerrado no Omie/);
  });

  it("sem prazo, ou pedido sem prazo calculado, é um traço", () => {
    expect(texto({ previsao: null, situacao: "SEM_PRAZO", diasAte: null })).toBe("—");
    cleanup();
    expect(texto(null)).toBe("—");
  });
});
