// @vitest-environment jsdom
//
// A PÁGINA PÚBLICA do fornecedor, depois que a data dele virou PROPOSTA.
//
// ⚠⚠ O QUE ESTE ARQUIVO PEGA é a promessa errada. Enquanto a data valia na hora, dizer
// "registrada com sucesso" era verdade. Agora ela espera Compras — e essa frase faria o
// fornecedor programar o carregamento para uma data que a Torg ainda não aceitou. Ninguém
// descobriria a divergência antes do caminhão.
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// ⚠ `CampoData` é o seletor de data do portal (máscara + calendário). Aqui ele vira um input
// simples: o que este arquivo testa é o TEXTO da página, não o componente de data.
vi.mock("@/components/CampoData", () => ({
  default: ({ value, onChange, className }) => (
    <input type="date" className={className} value={value || ""}
      onChange={(e) => onChange(e.target.value)} />
  ),
}));

import EntregaFornecedorForm from "@/app/fornecedores/entrega/[token]/EntregaFornecedorForm";

const DADOS = {
  success: true, numero: "1977", fornecedor: "SOUFER",
  prazoEntregaPrevisto: "2026-09-08T00:00:00.000Z",
  prazoOriginal: null, jaEntregue: false,
  propostaEmAnalise: null, itensPendentes: [], totalItens: 0, prazoHistorico: [],
};

const abrir = (extra = {}) => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...DADOS, ...extra }) });
  return render(<EntregaFornecedorForm token="tok-123" />);
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("a proposta em análise", () => {
  // ⚠⚠ SEM ISTO ELE RESPONDIA E VOLTAVA AO LINK VENDO O PRAZO ANTIGO INTACTO — parecia que a
  // resposta se perdeu, e ele mandaria de novo. Cada reenvio é outro aviso para `compras@`.
  it("aparece com a data dele e diz que ainda não substituiu o prazo", async () => {
    abrir({ propostaEmAnalise: { prazo: "2026-11-20T00:00:00.000Z", em: "2026-09-18T14:00:00.000Z", motivo: null } });
    expect(await screen.findByText(/em analise/)).toBeTruthy();
    // ⚠ A data do prazo sai em UTC: ela veio de um `<input type="date">`, e em São Paulo o dia 20
    // apareceria como 19 — uma data que ele nunca digitou.
    expect(screen.getByText("20/11/2026")).toBeTruthy();
  });

  it("não aparece quando não há proposta pendente", async () => {
    abrir();
    await screen.findByText(/Pedido #1977/);
    expect(screen.queryByText(/em analise/)).toBeNull();
  });
});

describe("o que ele lê depois de enviar", () => {
  it("⚠⚠ diz que foi ENVIADA para análise, nunca 'registrada com sucesso'", async () => {
    abrir();
    await screen.findByText(/Pedido #1977/);

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, proposto: true }) });
    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: "2026-11-20" } });
    fireEvent.click(screen.getByText(/Confirmar previsao/i));

    await waitFor(() => expect(screen.getByText(/Previsao enviada!/)).toBeTruthy());
    expect(screen.getByText(/vai confirmar/)).toBeTruthy();
    expect(screen.queryByText(/registrada com sucesso/)).toBeNull();
  });
});
