// Matheus (02/10/2026): "na tela de OPs, em cada OP tem a lista de pedidos de compra — precisamos
// incluir uma coluna com o prazo de entrega que fica lá em Prazos das RMs; utilize o número do
// pedido para vincular". A coluna tem de dizer a MESMA data que Prazos das RMs, então a conta é a
// dela (`situacaoDoPedido`) — aqui só se resume o que a tabela precisa.
import { describe, it, expect } from "vitest";
import { prazoDoPedido, CAMPOS_PRAZO_PEDIDO } from "@/lib/prazo-do-pedido";

const AGORA = new Date("2026-10-02T15:00:00Z");
const base = { numeroPedido: "2071", createdAt: "2026-09-16T12:00:00Z", prazoHistorico: [], acompanhamentos: [], cotacao: { observacao: null, itens: [] } };

describe("prazoDoPedido", () => {
  it("previsão gravada no pedido, ainda no prazo", () => {
    expect(prazoDoPedido({ ...base, prazoEntregaPrevisto: "2026-10-15T00:00:00Z" }, AGORA))
      .toMatchObject({ previsao: "2026-10-15", situacao: "NO_PRAZO", diasAte: 13 });
  });

  it("⚠ a data REMARCADA vale, não a original — como em Prazos das RMs", () => {
    const p = { ...base, prazoEntregaPrevisto: "2026-09-16T00:00:00Z",
      prazoHistorico: [{ prazoAnterior: "2026-09-16T00:00:00Z", prazoNovo: "2026-10-01T00:00:00Z", criadoEm: "2026-09-24T12:00:00Z" }] };
    expect(prazoDoPedido(p, AGORA)).toMatchObject({ previsao: "2026-10-01", situacao: "ATRASADO", diasAte: -1 });
  });

  it("sem data no pedido, usa o prazo dos itens da cotação", () => {
    const p = { ...base, prazoEntregaPrevisto: null, cotacao: { observacao: null, itens: [{ vencedor: true, prazoEntrega: "2026-10-05T00:00:00Z" }] } };
    expect(prazoDoPedido(p, AGORA)).toMatchObject({ previsao: "2026-10-05", situacao: "PROXIMO" });
  });

  it("encerrado no Omie conta como chegou", () => {
    const p = { ...base, prazoEntregaPrevisto: "2026-09-20T00:00:00Z", encerradoOmieEm: "2026-09-25T10:00:00Z" };
    expect(prazoDoPedido(p, AGORA)).toMatchObject({ situacao: "CHEGOU", porEncerramento: true });
  });

  it("sem nenhuma fonte de data: sem prazo, e previsão nula (não inventa)", () => {
    expect(prazoDoPedido({ ...base, prazoEntregaPrevisto: null }, AGORA)).toEqual({ previsao: null, situacao: "SEM_PRAZO", diasAte: null, porEncerramento: false });
  });

  it("os campos buscados incluem tudo de que a conta precisa", () => {
    for (const k of ["prazoEntregaPrevisto", "prazoHistorico", "acompanhamentos", "statusEntrega", "encerradoOmieEm", "dataEntregaReal", "recebidoEm", "createdAt", "cotacao"]) {
      expect(CAMPOS_PRAZO_PEDIDO).toHaveProperty(k);
    }
  });
});
