import { beforeEach, describe, it, expect, vi } from "vitest";

// ⚠⚠ Matheus (09/09/2026): "no campo RNCANTT ter esse campo dentro do portal na hora do frete para
// colocar e preencher na aba FRETE da remessa". O campo NÃO EXISTE no Omie — medido contra a conta
// real em 16/09/2026: `ConsultarCliente` da transportadora devolve 65 campos, nenhum RNTRC/ANTT, e
// `ConsultarRemessa` da remessa 660 devolve um bloco `frete` de exatamente 13 campos. O único lugar
// do payload que sai impresso na NF-e e aceita texto livre é `infAdic.cDadosAdic`.
//
// Estes testes travam as duas metades disso: o número CHEGA nas Informações Adicionais, e NÃO
// vai parar no bloco `frete` — onde faria o Omie recusar a remessa inteira com "Tag [...] não faz
// parte da estrutura", e o erro só apareceria na emissão.

const mocks = vi.hoisted(() => ({ omieCall: vi.fn(), resolverCodProjetoPorOp: vi.fn() }));
vi.mock("@/lib/omie-call", () => ({ omieCall: mocks.omieCall }));
vi.mock("@/lib/omie-pedidos-abertos", () => ({ resolverCodProjetoPorOp: mocks.resolverCodProjetoPorOp }));

const ROMANEIO = { numero: 7, itens: [{ marca: "T104A45", qte: 1, pesoTotal: 100, descricao: "CHAPA PISO" }], materiais: [], opRefNumero: "085", servico: "GALVANIZACAO" };
const TERCEIRO = { nCodOmie: 7318286270, uf: "SP" };

const incluir = () => mocks.omieCall.mock.calls.find(([, call]) => call === "IncluirRemessa")[2];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolverCodProjetoPorOp.mockResolvedValue(null);
  mocks.omieCall.mockImplementation(async (url, call) => {
    if (call === "ConsultarProduto") return { codigo_produto: 111 };
    if (call === "IncluirRemessa") return { nCodRem: 999, cNumeroRemessa: "1" };
    throw new Error(`chamada Omie não esperada no teste: ${call}`);
  });
});

describe("criarPedidoRemessa — RNTRC/ANTT nas Informações Adicionais", () => {
  it("o RNTRC digitado sai no cDadosAdic, depois da obra", async () => {
    const { criarPedidoRemessa } = await import("@/lib/omie-remessa-industrializacao");
    await criarPedidoRemessa(ROMANEIO, TERCEIRO, { valorKg: 12.5, frete: { tpFrete: "0", rntrc: "12345678" } });
    expect(incluir().infAdic.cDadosAdic)
      .toBe("Remessa - Romaneio 7 | OP 085 | Obra/Servico: GALVANIZACAO | RNTRC: 12345678");
  });

  it("⚠ o RNTRC NÃO entra no bloco frete — o Omie recusaria a remessa inteira", async () => {
    const { criarPedidoRemessa } = await import("@/lib/omie-remessa-industrializacao");
    await criarPedidoRemessa(ROMANEIO, TERCEIRO, { valorKg: 12.5, frete: { tpFrete: "0", rntrc: "12345678" } });
    const frete = incluir().frete;
    expect(frete).not.toHaveProperty("rntrc");
    expect(JSON.stringify(frete)).not.toContain("12345678");
  });

  it("sem RNTRC, o cDadosAdic continua exatamente como era antes", async () => {
    const { criarPedidoRemessa } = await import("@/lib/omie-remessa-industrializacao");
    await criarPedidoRemessa(ROMANEIO, TERCEIRO, { valorKg: 12.5, frete: { tpFrete: "0" } });
    expect(incluir().infAdic.cDadosAdic)
      .toBe("Remessa - Romaneio 7 | OP 085 | Obra/Servico: GALVANIZACAO");
  });

  it("sem bloco de frete nenhum a remessa continua saindo", async () => {
    const { criarPedidoRemessa } = await import("@/lib/omie-remessa-industrializacao");
    const r = await criarPedidoRemessa(ROMANEIO, TERCEIRO, { valorKg: 12.5 });
    expect(r.codigoPedido).toBe(999);
    expect(incluir().infAdic.cDadosAdic).not.toContain("RNTRC");
  });

  it("o texto livre do Fiscal (infoAdic) segue mandando na primeira parte, com o RNTRC no fim", async () => {
    const { criarPedidoRemessa } = await import("@/lib/omie-remessa-industrializacao");
    await criarPedidoRemessa(ROMANEIO, TERCEIRO, { valorKg: 12.5, infoAdic: "Retorno até 30/09", frete: { rntrc: "999" } });
    expect(incluir().infAdic.cDadosAdic)
      .toBe("Retorno até 30/09 | OP 085 | Obra/Servico: GALVANIZACAO | RNTRC: 999");
  });
});

describe("normalizarRntrc", () => {
  it("guarda só os dígitos — o Fiscal cola de qualquer lugar", async () => {
    const { normalizarRntrc } = await import("@/lib/omie-remessa-infadic");
    expect(normalizarRntrc({ rntrc: "RNTRC 123.456-78" })).toBe("12345678");
  });

  it("corta em 12 dígitos e trata ausência sem quebrar", async () => {
    const { normalizarRntrc } = await import("@/lib/omie-remessa-infadic");
    expect(normalizarRntrc({ rntrc: "1234567890123456" })).toBe("123456789012");
    expect(normalizarRntrc({})).toBe("");
    expect(normalizarRntrc(null)).toBe("");
    expect(normalizarRntrc(undefined)).toBe("");
  });

  it("texto sem dígito nenhum não vira 'RNTRC: ' vazio na nota", async () => {
    const { normalizarRntrc } = await import("@/lib/omie-remessa-infadic");
    expect(normalizarRntrc({ rntrc: "a definir" })).toBe("");
  });
});
