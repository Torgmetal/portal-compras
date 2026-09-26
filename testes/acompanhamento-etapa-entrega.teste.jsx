// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ETAPAS_VALIDAS, linhaDoTempo } from "@/lib/acompanhamento-pedido";
import { agruparPorRM } from "@/lib/painel-prazos-rm";

// ⚠⚠ ETAPA "ENTREGA" (Matheus, 24/09/2026): *"crie mais uma opção chamada Entrega, para eu
// conseguir colocar observação igual fiz no pedido 1976 — um dos itens vai chegar 29/09, o
// restante 15/10"*. É anotação de ENTREGA COMBINADA (muitas vezes parcial), não chegada: não
// pode marcar o pedido como "Chegou" nem mudar a previsão que decide atraso e cobrança.

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { tipo: "ADMIN" } } }) }));
vi.mock("next/link", () => ({ default: ({ href, children }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));
const { default: CartaoRM } = await import("@/app/compras/prazos/CartaoRM");

const HOJE = "2026-09-24";
const AGORA = new Date("2026-09-24T15:00:00Z");
const entrega = (id, data, observacao) => ({
  id, etapa: "ENTREGA", data: new Date(`${data}T00:00:00Z`), observacao, registradoPor: { name: "Matheus" }, criadoEm: AGORA,
});
const pedido = (acompanhamentos) => ({
  id: "p1976", numeroPedido: "1976", fornecedorNome: "SOUFER", total: 1000, status: "CRIADO",
  createdAt: new Date("2026-09-01"), prazoEntregaPrevisto: new Date("2026-09-15T00:00:00Z"),
  statusEntrega: null, dataEntregaReal: null, encerradoOmieEm: null, prazoHistorico: [],
  acompanhamentos, cotacao: null, faturamentoDireto: false,
  rm: { id: "rm1", numero: "T118-004-R00", op: { id: "op", numero: 118, cliente: "DANPOWER" } },
});

afterEach(() => cleanup());

describe("etapa Entrega", () => {
  it("é uma opção válida do seletor e da rota", () => {
    expect(ETAPAS_VALIDAS).toContain("ENTREGA");
  });

  it("data futura sai como 'Entrega prevista'", () => {
    const [ev] = linhaDoTempo(pedido([entrega("a", "2026-09-29", "1 item")]), { hoje: HOJE }).eventos.filter((e) => e.tipo === "etapa");
    expect(ev.prevista).toBe(true);
    expect(ev.titulo).toBe("Entrega prevista");
  });

  it("⚠⚠ não conta como chegada — o pedido continua atrasado", () => {
    const [linha] = agruparPorRM([pedido([entrega("a", "2026-09-20", "parte chegou")])], AGORA);
    expect(linha.pedidos[0].situacao).toBe("ATRASADO");
  });

  it("⚠ caso real #1976: duas entregas, cada uma com a sua observação", () => {
    const [linha] = agruparPorRM([pedido([
      entrega("a", "2026-09-29", "UM ITEM"),
      entrega("b", "2026-10-15", "RESTANTE"),
    ])], AGORA);
    render(<CartaoRM l={linha} onDecidido={() => {}} />);
    expect(screen.getByText(/Entrega prevista para 29\/09\/2026/)).toBeTruthy();
    expect(screen.getByText(/Entrega prevista para 15\/10\/2026/)).toBeTruthy();
    expect(screen.getByText(/UM ITEM/)).toBeTruthy();
    expect(screen.getByText(/RESTANTE/)).toBeTruthy();
  });
});
