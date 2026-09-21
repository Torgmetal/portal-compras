import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// ⚠⚠ O QUE CHEGA NO OMIE. Matheus (16/09/2026): "no Omie eu preciso que seja preenchido certo no
// pedido de compra o campo IPI do valor unitário, está entrando o preço unitário cheio com IPI sem
// entrar no campo de IPI" — e, no mesmo dia: "quando colocarmos observações nos itens é importante
// sair na observação do item no pedido de compra no Omie também".
//
// Os nomes dos campos vieram de duas fontes que concordam: o pedido 2077 consultado depois de ele
// corrigir à mão, e a documentação da API (`nValorIpi` é o imposto em REAIS, `cObs` é a observação
// do item). Este arquivo trava o payload — nenhuma chamada real ao Omie.

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/condicao-pagamento", () => ({ resolverCondicaoPagamento: () => null }));

const itemBase = {
  codigo: "022574", descricao: "RUFO GALVALUME 0.50mm", unidade: "MT",
  qtd: 66, precoUnit: 40.68, ipiPct: 3.25, valorIpi: 87.26,
  totalComImpostos: 2772.14, observacao: null,
};

/** O corpo enviado ao Omie na chamada de inclusão. */
function payloadEnviado() {
  const chamada = mocks.fetch.mock.calls.find(([url]) => String(url).includes("pedidocompra"));
  const corpo = JSON.parse(chamada[1].body);
  return corpo.param[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OMIE_APP_KEY = "k";
  process.env.OMIE_APP_SECRET = "s";
  process.env.OMIE_CONTA_CORRENTE_PADRAO = "123";
  mockPrisma.estoqueItem.findUnique.mockResolvedValue({ unidade: "MT", descricao: "RUFO GALVALUME 0.50mm" });
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ codigo_pedido: 1, numero_pedido: "9999" }),
    text: async () => "{}",
  });
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("produtos_incluir — o IPI vai destacado", () => {
  it("⚠⚠ nValUnit é o preço LÍQUIDO, não o preço com IPI embutido", async () => {
    const { criarPedidoOmie } = await import("@/lib/omie-pedido-compra");
    await criarPedidoOmie({ itens: [itemBase], nCodFor: 1 });
    const p = payloadEnviado().produtos_incluir[0];
    expect(p.nValUnit).toBe(40.68);
    expect(p.nValUnit).not.toBe(42.714); // o valor errado que chegou no pedido 2077
  });

  it("nValorIpi leva o imposto em REAIS", async () => {
    const { criarPedidoOmie } = await import("@/lib/omie-pedido-compra");
    await criarPedidoOmie({ itens: [itemBase], nCodFor: 1 });
    expect(payloadEnviado().produtos_incluir[0].nValorIpi).toBe(87.26);
  });

  it("⚠ item sem IPI não manda o campo — não é zero explícito no payload", async () => {
    const { criarPedidoOmie } = await import("@/lib/omie-pedido-compra");
    await criarPedidoOmie({ itens: [{ ...itemBase, ipiPct: 0, valorIpi: 0 }], nCodFor: 1 });
    expect(payloadEnviado().produtos_incluir[0]).not.toHaveProperty("nValorIpi");
  });
});

describe("produtos_incluir — a observação do item", () => {
  it("vai em cObs quando a engenharia escreveu alguma", async () => {
    const { criarPedidoOmie } = await import("@/lib/omie-pedido-compra");
    await criarPedidoOmie({ itens: [{ ...itemBase, observacao: "Maquina de Solda TIG Inversora" }], nCodFor: 1 });
    expect(payloadEnviado().produtos_incluir[0].cObs).toBe("Maquina de Solda TIG Inversora");
  });

  it("⚠ passa pelo saneamento do Latin-1 — travessão vira hífen, como no resto do payload", async () => {
    const { criarPedidoOmie } = await import("@/lib/omie-pedido-compra");
    await criarPedidoOmie({ itens: [{ ...itemBase, observacao: "entrega — portaria 2" }], nCodFor: 1 });
    expect(payloadEnviado().produtos_incluir[0].cObs).toBe("entrega - portaria 2");
  });

  it("sem observação, o campo não é enviado", async () => {
    const { criarPedidoOmie } = await import("@/lib/omie-pedido-compra");
    await criarPedidoOmie({ itens: [itemBase], nCodFor: 1 });
    expect(payloadEnviado().produtos_incluir[0]).not.toHaveProperty("cObs");
  });

  it("observação muito longa é cortada em 255 — o Omie recusa acima disso", async () => {
    const { criarPedidoOmie } = await import("@/lib/omie-pedido-compra");
    await criarPedidoOmie({ itens: [{ ...itemBase, observacao: "x".repeat(400) }], nCodFor: 1 });
    expect(payloadEnviado().produtos_incluir[0].cObs).toHaveLength(255);
  });
});
