// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { agruparPorRM, historicoDaPrevisao } from "@/lib/painel-prazos-rm";

// ⚠⚠ A DATA DE ENTREGA REMARCADA POR DENTRO NÃO DEIXAVA RASTRO NO CARTÃO (24/09/2026). Matheus:
// *"alterei nos pedidos 2010 e 1977, mas não ficou o histórico nem a observação que eu escrevi"*.
// O `PrazoHistorico` estava gravado (1977: 08/09 → 29/09, "TUBO 26,90MM ATÉ 02/10"), mas o cartão
// só mostrava alteração com o prefixo `[Fornecedor]` — a feita pelo Compras era descartada.

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { tipo: "ADMIN" } } }) }));
vi.mock("next/link", () => ({ default: ({ href, children }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));

const { default: CartaoRM } = await import("@/app/compras/prazos/CartaoRM");

const hist = (id, de, para, motivo, criadoEm, por = "Matheus") => ({
  id, prazoAnterior: de ? new Date(de) : null, prazoNovo: new Date(para), motivo,
  criadoEm: new Date(criadoEm), alteradoPor: por ? { name: por } : null,
});

const pedido = (prazoHistorico) => ({
  id: "p1977", numeroPedido: "1977", fornecedorNome: "SOUFER", fornecedorCnpj: "11111111000100",
  total: 1000, status: "CRIADO", createdAt: new Date("2026-09-01"),
  prazoEntregaPrevisto: new Date("2026-09-29T00:00:00Z"), prazoOriginal: null,
  statusEntrega: null, dataEntregaReal: null, recebidoEm: null, encerradoOmieEm: null,
  prazoHistorico, acompanhamentos: [], cotacao: null, faturamentoDireto: false,
  rm: { id: "rm1", numero: "T118-001-R00", op: { id: "op", numero: 118, cliente: "DANPOWER" } },
  op: { id: "op", numero: 118, cliente: "DANPOWER" },
});

const AGORA = new Date("2026-09-24T22:00:00Z");
afterEach(() => cleanup());

describe("historicoDaPrevisao", () => {
  it("devolve a alteração interna, com de/para, autor e observação", () => {
    const r = historicoDaPrevisao(pedido([hist("h1", "2026-09-08", "2026-09-29", "TUBO 26,90MM ATÉ 02/10", "2026-09-24T21:48:00Z")]));
    expect(r).toEqual([{
      id: "h1", de: new Date("2026-09-08"), para: new Date("2026-09-29"), em: new Date("2026-09-24T21:48:00Z"),
      por: "Matheus", motivo: "TUBO 26,90MM ATÉ 02/10", doFornecedor: false,
    }]);
  });

  it("a do fornecedor sai marcada, e sem o prefixo no texto", () => {
    const [r] = historicoDaPrevisao(pedido([hist("h1", "2026-09-08", "2026-09-29", "[Fornecedor] atraso na laminação", "2026-09-20")]));
    expect(r.doFornecedor).toBe(true);
    expect(r.motivo).toBe("atraso na laminação");
  });

  it("ordena pela data da alteração e trata observação vazia como ausente", () => {
    const r = historicoDaPrevisao(pedido([
      hist("b", "2026-09-20", "2026-09-29", "  ", "2026-09-24"),
      hist("a", "2026-09-08", "2026-09-20", null, "2026-09-18"),
    ]));
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r[1].motivo).toBeNull();
  });
});

describe("o cartão mostra a data de entrega remarcada", () => {
  it("⚠⚠ caso real #1977: de/para e a observação escrita", () => {
    const [linha] = agruparPorRM([pedido([hist("h1", "2026-09-08", "2026-09-29", "TUBO 26,90MM ATÉ 02/10", "2026-09-24T21:48:00Z")])], AGORA);
    render(<CartaoRM l={linha} onDecidido={() => {}} />);
    expect(screen.getByText(/Data de entrega alterada de 08\/09\/2026 para 29\/09\/2026/)).toBeTruthy();
    expect(screen.getByText(/TUBO 26,90MM ATÉ 02\/10/)).toBeTruthy();
    expect(screen.getByText(/Matheus/)).toBeTruthy();
  });

  it("caso real #2010: sem observação, a alteração aparece mesmo assim", () => {
    const [linha] = agruparPorRM([pedido([hist("h1", "2026-09-09", "2026-10-30", null, "2026-09-24T21:50:00Z")])], AGORA);
    render(<CartaoRM l={linha} onDecidido={() => {}} />);
    expect(screen.getByText(/Data de entrega alterada de 09\/09\/2026 para 30\/10\/2026/)).toBeTruthy();
  });

  it("a do fornecedor continua dizendo que veio do fornecedor", () => {
    const [linha] = agruparPorRM([pedido([hist("h1", "2026-09-08", "2026-09-29", "[Fornecedor] vou atrasar", "2026-09-20")])], AGORA);
    render(<CartaoRM l={linha} onDecidido={() => {}} />);
    expect(screen.getByText(/informada pelo fornecedor/)).toBeTruthy();
    expect(screen.getByText(/vou atrasar/)).toBeTruthy();
  });

  it("cada alteração na sua linha", () => {
    const [linha] = agruparPorRM([pedido([
      hist("a", "2026-09-08", "2026-09-20", "primeira", "2026-09-18"),
      hist("b", "2026-09-20", "2026-09-29", "segunda", "2026-09-24"),
    ])], AGORA);
    const { container } = render(<CartaoRM l={linha} onDecidido={() => {}} />);
    const itens = [...container.querySelectorAll("li li")].filter((li) => /alterada/.test(li.textContent));
    expect(itens).toHaveLength(2);
  });
});
