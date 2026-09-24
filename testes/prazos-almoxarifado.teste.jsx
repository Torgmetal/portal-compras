// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { moduloNegado } from "@/lib/portao-modulos";

// ⚠⚠ "VER QUANDO CHEGA O MATERIAL" É LEITURA. A tela também SINCRONIZA com o Omie, COBRA
// fornecedor por e-mail e APROVA remarcação de prazo — três atos para fora da empresa. Estes
// testes guardam a linha entre as duas coisas.

const almox = { modulos: ["ALMOXARIFADO", "REQUISICOES", "EXPEDICAO"] };
const compras = { modulos: ["COMPRAS"] };
const admin = { tipo: "ADMIN" };

describe("o portão da rota", () => {
  it("deixa o almoxarifado abrir Prazos das RMs", () => {
    expect(moduloNegado("/compras/prazos", almox)).toBeNull();
  });
  it("continua deixando o Compras e o ADMIN", () => {
    expect(moduloNegado("/compras/prazos", compras)).toBeNull();
    expect(moduloNegado("/compras/prazos", admin)).toBeNull();
  });
  // ⚠⚠ O RESTO DO COMPRAS CONTINUA FECHADO. Se o `startsWith("/compras/prazos")` fosse escrito
  // errado (ou viesse depois do `/compras` genérico), o almoxarife ganharia o módulo inteiro —
  // cotações, mapa de preços de concorrentes, geração de pedido.
  it("NÃO abre o resto do Compras para o almoxarifado", () => {
    for (const r of ["/compras", "/compras/rm/abc", "/compras/cotacoes", "/compras/cronograma"]) {
      expect(moduloNegado(r, almox)).toBe("COMPRAS");
    }
  });
  it("quem não tem nem COMPRAS nem ALMOXARIFADO continua barrado", () => {
    expect(moduloNegado("/compras/prazos", { modulos: ["PRODUCAO"] })).toBe("COMPRAS");
  });
});

// ─── A TELA ──────────────────────────────────────────────────────────────────
const sessao = { data: null };
vi.mock("next-auth/react", () => ({ useSession: () => sessao }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));

const { default: PropostaDePrazo } = await import("@/app/compras/prazos/PropostaDePrazo");

const PEDIDO = {
  fornecedorNome: "SOUFER",
  propostaPendente: { prazo: "2026-10-10T00:00:00.000Z", em: "2026-09-24T00:00:00.000Z", motivo: "atraso na laminação", id: "v1" },
};

afterEach(() => cleanup());
beforeEach(() => { sessao.data = null; });

describe("a proposta do fornecedor na tela", () => {
  it("o almoxarifado VÊ a proposta — é ela que avisa que a data pode mudar", () => {
    sessao.data = { user: almox };
    render(<PropostaDePrazo pedido={PEDIDO} onDecidido={() => {}} />);
    expect(screen.getByText(/propôs 10\/10\/2026/i)).toBeTruthy();
  });

  // ⚠⚠⚠ APROVAR MUDA O PRAZO **E** MANDA E-MAIL AO FORNECEDOR. Não é "ver quando chega".
  it("mas NÃO recebe os botões de aprovar e recusar", () => {
    sessao.data = { user: almox };
    render(<PropostaDePrazo pedido={PEDIDO} onDecidido={() => {}} />);
    expect(screen.queryByRole("button", { name: /Aprovar/i })).toBeNull();
    expect(screen.getByText(/Aguardando decisão do Compras/i)).toBeTruthy();
  });

  it("o Compras recebe os botões", () => {
    sessao.data = { user: compras };
    render(<PropostaDePrazo pedido={PEDIDO} onDecidido={() => {}} />);
    expect(screen.getByRole("button", { name: /Aprovar/i })).toBeTruthy();
  });

  it("o ADMIN também", () => {
    sessao.data = { user: admin };
    render(<PropostaDePrazo pedido={PEDIDO} onDecidido={() => {}} />);
    expect(screen.getByRole("button", { name: /Aprovar/i })).toBeTruthy();
  });
});
