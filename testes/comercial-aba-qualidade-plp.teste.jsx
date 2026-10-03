// @vitest-environment jsdom
// Matheus (03/10/2026): "usuário producao2 Diego, ele precisa ter acesso aos PLP das obras". O PDF do
// PLP já aceitava o módulo PRODUÇÃO, mas a aba Qualidade da OP buscava antes os relatórios de inspeção
// (só da Qualidade) e, com o 403, sumia inteira — o botão do PLP junto.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/comercial/PitCompacto", () => ({ default: () => <div>PIT</div> }));
vi.mock("@/app/comercial/[id]/AceitePlano", () => ({ default: () => <div>ACEITE DO PLANO</div> }));
vi.mock("@/app/comercial/[id]/EditarPlp", () => ({ default: () => <button>Editar PLP</button> }));

import AbaQualidade from "@/app/comercial/[id]/AbaQualidade";

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "Forbidden" }) }));
});
afterEach(cleanup);

describe("Aba Qualidade da OP — PLP para quem só consulta", () => {
  it("produção: vê o PLP em PDF, sem editar nem enviar para aprovação", async () => {
    render(<AbaQualidade opNumero="124" soConsulta />);
    const link = await screen.findByRole("link", { name: /ver plp/i });
    expect(link.getAttribute("href")).toBe("/api/qualidade/planos/124/pdf?doc=PLP");
    expect(screen.queryByRole("button", { name: /editar plp/i })).toBeNull();
    expect(screen.queryByText("ACEITE DO PLANO")).toBeNull();
    expect(screen.queryByText("Forbidden")).toBeNull();
    // a lista de relatórios é da Qualidade: nem pergunta
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/qualidade/inspecoes"));
  });

  it("falha na lista de relatórios não esconde o PLP", async () => {
    render(<AbaQualidade opNumero="124" />);
    await screen.findByText("Forbidden");
    expect(screen.getByRole("link", { name: /gerar plp/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /editar plp/i })).toBeTruthy();
  });
});
