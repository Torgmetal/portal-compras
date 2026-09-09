import { beforeEach, describe, it, expect, vi } from "vitest";

// ⚠⚠ Matheus (09/09/2026): a remessa saía sem o PROJETO vinculado no Omie — print da aba
// "Informações Adicionais" com o campo vazio. Achado consultando uma remessa real via
// ConsultarRemessa: `nCodProj` mora em `infAdic`, não em `cabec` (não documentado). Estes testes
// travam que o resolvedor (número da OP → projeto já cadastrado) é chamado e o código chega no
// lugar certo do payload — sem bater na conta real do Omie.

const mocks = vi.hoisted(() => ({ omieCall: vi.fn(), resolverCodProjetoPorOp: vi.fn() }));
vi.mock("@/lib/omie-call", () => ({ omieCall: mocks.omieCall }));
vi.mock("@/lib/omie-pedidos-abertos", () => ({ resolverCodProjetoPorOp: mocks.resolverCodProjetoPorOp }));

const ROMANEIO = { numero: 5, itens: [{ marca: "T104A45", qte: 1, pesoTotal: 100, descricao: "CHAPA PISO" }], materiais: [], opRefNumero: "104", servico: null };
const TERCEIRO = { nCodOmie: 7318286270, uf: "SP" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.omieCall.mockImplementation(async (url, call) => {
    if (call === "ConsultarProduto") return { codigo_produto: 111 }; // ARM000001 → ID interno
    if (call === "IncluirRemessa") return { nCodRem: 999, cNumeroRemessa: "1" };
    throw new Error(`chamada Omie não esperada no teste: ${call}`);
  });
});

describe("criarPedidoRemessa — vínculo com o Projeto (infAdic.nCodProj)", () => {
  it("resolve o projeto pela OP e manda em infAdic.nCodProj", async () => {
    mocks.resolverCodProjetoPorOp.mockResolvedValue(7804006571);
    const { criarPedidoRemessa } = await import("@/lib/omie-remessa-industrializacao");
    const r = await criarPedidoRemessa(ROMANEIO, TERCEIRO, { valorKg: 12.5 });
    expect(r.codigoPedido).toBe(999);
    expect(mocks.resolverCodProjetoPorOp).toHaveBeenCalledWith("104");
    const chamada = mocks.omieCall.mock.calls.find(([, call]) => call === "IncluirRemessa");
    expect(chamada[2].infAdic.nCodProj).toBe(7804006571);
  });

  it("sem projeto correspondente no Omie, a remessa sai sem nCodProj — não trava a geração", async () => {
    mocks.resolverCodProjetoPorOp.mockResolvedValue(null);
    const { criarPedidoRemessa } = await import("@/lib/omie-remessa-industrializacao");
    const r = await criarPedidoRemessa(ROMANEIO, TERCEIRO, { valorKg: 12.5 });
    expect(r.codigoPedido).toBe(999);
    const chamada = mocks.omieCall.mock.calls.find(([, call]) => call === "IncluirRemessa");
    expect(chamada[2].infAdic).not.toHaveProperty("nCodProj");
  });

  it("falha do resolvedor não trava a remessa — best-effort", async () => {
    mocks.resolverCodProjetoPorOp.mockRejectedValue(new Error("Omie fora do ar"));
    const { criarPedidoRemessa } = await import("@/lib/omie-remessa-industrializacao");
    const r = await criarPedidoRemessa(ROMANEIO, TERCEIRO, { valorKg: 12.5 });
    expect(r.codigoPedido).toBe(999);
  });
});
