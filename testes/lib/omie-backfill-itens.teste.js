// O backfill de `itensOmie` — trabalho de fundo que tem de morrer PRIMEIRO.
//
// ⚠⚠ Antes de 17/09/2026 o prazo era conferido só na ENTRADA daqui: passando por um fio, ele ainda
// gastava dez consultas ao Omie com o orçamento no fim — e era ele quem estourava a rota, depois
// de o laço principal ter parado justamente para evitar isso (achado do Codex).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { backfillItensOmie } from "@/lib/omie-backfill-itens";

const prismaFake = (pedidos) => ({
  pedidoOmie: {
    findMany: vi.fn(async () => pedidos),
    update: vi.fn(async () => ({})),
  },
});

const PEDIDO = { produtos_consulta: [{ cDescricao: "CHAPA", nQtde: 10, nQtdeRec: 4, cUnidade: "KG", nValUnit: 5 }] };
const daqui = (ms) => Date.now() + ms;

beforeEach(() => vi.clearAllMocks());

describe("backfillItensOmie", () => {
  it("preenche os pedidos que não têm itens", async () => {
    const prisma = prismaFake([{ id: "p1", codigoPedido: "1", faturamentoDireto: false }]);
    const consultar = vi.fn(async () => PEDIDO);
    expect(await backfillItensOmie(prisma, daqui(30_000), consultar)).toBe(1);
    expect(prisma.pedidoOmie.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { itensOmie: [{ descricao: "CHAPA", qtd: 10, unidade: "KG", valorUnit: 5, qtdRecebida: 4 }] },
    });
  });

  it("com o prazo vencido, nem consulta o banco", async () => {
    const prisma = prismaFake([{ id: "p1", codigoPedido: "1" }]);
    expect(await backfillItensOmie(prisma, daqui(-1), vi.fn())).toBe(0);
    expect(prisma.pedidoOmie.findMany).not.toHaveBeenCalled();
  });

  // ⚠⚠ A CADA VOLTA, NÃO SÓ NA ENTRADA: dez consultas ao Omie a 45s cada não cabem no que sobrou
  // do orçamento do sync.
  it("⚠⚠ prazo já vencido no meio: só o que coube foi gravado", async () => {
    const prisma = prismaFake([1, 2, 3].map((n) => ({ id: `p${n}`, codigoPedido: String(n), faturamentoDireto: false })));
    const consultar = vi.fn(async () => PEDIDO);
    // prazo de 200ms e uma pausa de 350ms entre pedidos → o 2º não começa
    const n = await backfillItensOmie(prisma, daqui(200), consultar);
    expect(n).toBe(1);
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  // ⚠ FD não tem itens de pedido de compra — o material vai do fornecedor direto ao cliente.
  it("⚠ pula o faturamento direto sem gastar chamada", async () => {
    const prisma = prismaFake([{ id: "p1", codigoPedido: "1", faturamentoDireto: true }]);
    const consultar = vi.fn();
    expect(await backfillItensOmie(prisma, daqui(30_000), consultar)).toBe(0);
    expect(consultar).not.toHaveBeenCalled();
  });

  // ⚠ Item sem detalhe é informação a menos numa tela; sync que falha por causa dele é entrega
  // que ninguém vê.
  it("⚠ erro numa consulta não derruba o sync — nem as outras", async () => {
    const prisma = prismaFake([1, 2].map((n) => ({ id: `p${n}`, codigoPedido: String(n), faturamentoDireto: false })));
    const consultar = vi.fn()
      .mockRejectedValueOnce(new Error("Omie fora"))
      .mockResolvedValueOnce(PEDIDO);
    expect(await backfillItensOmie(prisma, daqui(30_000), consultar)).toBe(1);
  });

  it("o prazo desce até a consulta ao Omie", async () => {
    const prisma = prismaFake([{ id: "p1", codigoPedido: "1", faturamentoDireto: false }]);
    const consultar = vi.fn(async () => PEDIDO);
    const fim = daqui(30_000);
    await backfillItensOmie(prisma, fim, consultar);
    expect(consultar).toHaveBeenCalledWith("1", { ateMs: fim });
  });
});
