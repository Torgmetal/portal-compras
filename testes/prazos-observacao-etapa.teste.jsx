// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { agruparPorRM } from "@/lib/painel-prazos-rm";

// ⚠⚠ A OBSERVAÇÃO DO COMPRADOR NÃO APARECIA NOS PRAZOS DAS RMs (24/09/2026). Matheus: *"ajustou
// algumas datas e escreveu umas observações na frente, mas não veio as observações, somente as
// datas"*. A API trazia o texto; o cartão escrevia "{etapa} em {data}" e descartava o resto. No
// banco o custo já estava lá: o pedido #1976 foi lançado duas vezes em dois minutos, porque quem
// lançou não viu o texto aparecer.
//
// ⚠ O cartão é montado pelo MESMO `agruparPorRM` que a rota usa — a fixture não é um objeto
// inventado na forma que eu acho que a tela recebe.

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { tipo: "ADMIN" } } }) }));
vi.mock("next/link", () => ({ default: ({ href, children }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));

const { default: CartaoRM } = await import("@/app/compras/prazos/CartaoRM");

const pedido = (acompanhamentos) => ({
  id: "p1976", numeroPedido: "1976", fornecedorNome: "SOUFER", fornecedorCnpj: "11111111000100",
  total: 1000, status: "CRIADO", createdAt: new Date("2026-09-01"),
  prazoEntregaPrevisto: new Date("2026-09-15T12:00:00Z"), prazoOriginal: null,
  statusEntrega: null, dataEntregaReal: null, recebidoEm: null, encerradoOmieEm: null,
  prazoHistorico: [], acompanhamentos, cotacao: null, faturamentoDireto: false,
  rm: { id: "rm1", numero: "T118-004-R00", op: { id: "op", numero: 118, cliente: "DANPOWER" } },
  op: { id: "op", numero: 118, cliente: "DANPOWER" },
});

const lancamento = (id, observacao, criadoEm) => ({
  id, etapa: "LIBERADO_COLETA", data: new Date("2026-10-15T12:00:00Z"), observacao,
  registradoPor: { name: "Compras" }, criadoEm,
});

afterEach(() => cleanup());

describe("a observação da etapa aparece nos Prazos das RMs", () => {
  it("mostra o texto que o comprador escreveu", () => {
    const [linha] = agruparPorRM([pedido([lancamento("a1", "PERFIL 150X50X3,0MM ENTREGA ATÉ TERÇA")])]);
    render(<CartaoRM l={linha} onDecidido={() => {}} />);
    expect(screen.getByText(/PERFIL 150X50X3,0MM ENTREGA ATÉ TERÇA/)).toBeTruthy();
  });

  it("mostra quem lançou", () => {
    const [linha] = agruparPorRM([pedido([lancamento("a1", "TUBO 26,90MM ATÉ 02/10")])]);
    render(<CartaoRM l={linha} onDecidido={() => {}} />);
    expect(screen.getByText(/Compras/)).toBeTruthy();
  });

  it("etapa sem observação continua aparecendo, só com a data", () => {
    const [linha] = agruparPorRM([pedido([lancamento("a1", null)])]);
    render(<CartaoRM l={linha} onDecidido={() => {}} />);
    expect(screen.getByText(/Liberado para coleta em 15\/10\/2026/)).toBeTruthy();
  });

  // ⚠ O caso real do #1976: dois lançamentos da mesma etapa, um com e outro sem observação. Cada
  // um na sua linha — corridos numa só, não se saberia de qual data é o texto.
  it("duas etapas ficam em linhas separadas, cada uma com o seu texto", () => {
    const [linha] = agruparPorRM([pedido([
      lancamento("a1", null, new Date("2026-09-24T13:31:00Z")),
      lancamento("a2", "PERFIL 150X50X3,0MM ENTREGA ATÉ TERÇA", new Date("2026-09-24T13:33:00Z")),
    ])]);
    const { container } = render(<CartaoRM l={linha} onDecidido={() => {}} />);
    const itens = [...container.querySelectorAll("li li")].filter((li) => /Liberado para coleta/.test(li.textContent));
    expect(itens).toHaveLength(2);
    expect(itens.filter((li) => /ENTREGA ATÉ TERÇA/.test(li.textContent))).toHaveLength(1);
  });
});
