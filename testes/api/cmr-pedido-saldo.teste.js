import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1", tipo: "ADMIN" })) }));

const { GET } = await import("@/app/api/compras/cmr/pedido/route");

// ⚠⚠ O SALDO DO PEDIDO NA TELA DO CMR. Matheus (17/09/2026): "quando ele seleciona 1 item e ajusta
// a quantidade recebida não está abatendo o saldo que sobra no pedido mostrado".
//
// `itensOmie[].qtdRecebida` é uma FOTOGRAFIA do Omie, atualizada pelo cron `sync-entregas`. Um
// lançamento feito no CMR agora só chegaria lá depois que a nota entrasse no Omie e o cron rodasse
// — até então o "faltam 120" continuava dizendo 120 depois de receber 120.

const req = (numero = "1916") => ({ url: `http://x/api/compras/cmr/pedido?numero=${numero}` });

const pedidoCom = (itensOmie) => {
  mockPrisma.pedidoOmie.findFirst.mockResolvedValue({
    numeroPedido: "1916", fornecedorNome: "R SIMIONI", opId: null, nfNumero: null, itensOmie,
  });
};
const cmrCom = (linhas) => mockPrisma.documentoQualidade.findMany.mockResolvedValue(linhas);

const itens = async () => (await (await GET(req(), { params: {} })).json()).itens;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue(null);
  cmrCom([]);
});

describe("o que já chegou soma as duas origens", () => {
  it("sem nada recebido, falta tudo", async () => {
    pedidoCom([{ descricao: "PORCA A563", qtd: 120, unidade: "PC", qtdRecebida: 0 }]);
    expect((await itens())[0].qtdRecebida).toBe(0);
  });

  it("⚠⚠ lançamento do CMR abate o saldo mesmo com o Omie ainda zerado", async () => {
    pedidoCom([{ descricao: "PORCA A563", qtd: 120, unidade: "PC", qtdRecebida: 0 }]);
    cmrCom([{ nome: "PORCA A563", quantidade: 120, pesoKg: null }]);
    const [it] = await itens();
    expect(it.qtdRecebida).toBe(120);
    expect(it.recebidoCmr).toBe(120);
    expect(it.recebidoOmie).toBe(0);
  });

  it("recebimento parcial do CMR abate só a parte", async () => {
    pedidoCom([{ descricao: "PORCA A563", qtd: 120, unidade: "PC", qtdRecebida: 0 }]);
    cmrCom([{ nome: "PORCA A563", quantidade: 40, pesoKg: null }]);
    expect((await itens())[0].qtdRecebida).toBe(40);
  });

  it("⚠⚠ é o MAIOR dos dois, NUNCA a soma — senão a nota que entra no Omie contaria duas vezes", async () => {
    // A mesma mercadoria: lançada no CMR e, depois, reconhecida pelo Omie.
    pedidoCom([{ descricao: "PORCA A563", qtd: 120, unidade: "PC", qtdRecebida: 120 }]);
    cmrCom([{ nome: "PORCA A563", quantidade: 120, pesoKg: null }]);
    const [it] = await itens();
    expect(it.qtdRecebida).toBe(120);
    expect(it.qtdRecebida).not.toBe(240);
  });

  it("⚠ o Omie ganha quando ele sabe mais que o CMR", async () => {
    pedidoCom([{ descricao: "PORCA A563", qtd: 120, unidade: "PC", qtdRecebida: 100 }]);
    cmrCom([{ nome: "PORCA A563", quantidade: 30, pesoKg: null }]);
    expect((await itens())[0].qtdRecebida).toBe(100);
  });

  it("⚠ o recebido nunca passa do pedido — 200 lançados numa linha de 120 não viram saldo negativo", async () => {
    pedidoCom([{ descricao: "PORCA A563", qtd: 120, unidade: "PC", qtdRecebida: 0 }]);
    cmrCom([{ nome: "PORCA A563", quantidade: 200, pesoKg: null }]);
    expect((await itens())[0].qtdRecebida).toBe(120);
  });
});

describe("a mesma peça em várias linhas do pedido", () => {
  // ⚠⚠ O caso que o casamento por descrição precisa resolver: o pedido traz a MESMA peça em
  // linhas separadas (entregas, obras ou preços diferentes).
  const duasLinhas = () => pedidoCom([
    { descricao: "ARRUELA LISA A994", qtd: 120, unidade: "PC", qtdRecebida: 0 },
    { descricao: "ARRUELA LISA A994", qtd: 20, unidade: "PC", qtdRecebida: 0 },
  ]);

  it("⚠⚠ a quantidade lançada ENCHE uma linha antes de passar para a próxima", async () => {
    duasLinhas();
    cmrCom([{ nome: "ARRUELA LISA A994", quantidade: 130, pesoKg: null }]);
    const r = await itens();
    expect(r[0].qtdRecebida).toBe(120); // encheu a primeira
    expect(r[1].qtdRecebida).toBe(10);  // sobrou 10 para a segunda
  });

  it("⚠ não vaza para a segunda linha enquanto a primeira não fecha", async () => {
    duasLinhas();
    cmrCom([{ nome: "ARRUELA LISA A994", quantidade: 50, pesoKg: null }]);
    const r = await itens();
    expect(r[0].qtdRecebida).toBe(50);
    expect(r[1].qtdRecebida).toBe(0);
  });

  it("⚠ descrição diferente não se mistura", async () => {
    pedidoCom([
      { descricao: "PORCA A563", qtd: 120, unidade: "PC", qtdRecebida: 0 },
      { descricao: "ARRUELA LISA A994", qtd: 120, unidade: "PC", qtdRecebida: 0 },
    ]);
    cmrCom([{ nome: "PORCA A563", quantidade: 120, pesoKg: null }]);
    const r = await itens();
    expect(r[0].qtdRecebida).toBe(120);
    expect(r[1].qtdRecebida).toBe(0);
  });
});

describe("R lança peso, RC lança peças", () => {
  it("⚠ linha de peso (R) abate pelo pesoKg", async () => {
    pedidoCom([{ descricao: "CHAPA 3/16", qtd: 480, unidade: "KG", qtdRecebida: 0 }]);
    cmrCom([{ nome: "CHAPA 3/16", quantidade: null, pesoKg: 480 }]);
    expect((await itens())[0].qtdRecebida).toBe(480);
  });

  it("⚠ lançamento sem quantidade nem peso não abate nada", async () => {
    pedidoCom([{ descricao: "CHAPA 3/16", qtd: 480, unidade: "KG", qtdRecebida: 0 }]);
    cmrCom([{ nome: "CHAPA 3/16", quantidade: null, pesoKg: null }]);
    expect((await itens())[0].qtdRecebida).toBe(0);
  });

  it("⚠ a descrição casa ignorando caixa e espaço sobrando", async () => {
    pedidoCom([{ descricao: "PORCA  A563", qtd: 10, unidade: "PC", qtdRecebida: 0 }]);
    cmrCom([{ nome: " porca a563 ", quantidade: 10, pesoKg: null }]);
    expect((await itens())[0].qtdRecebida).toBe(10);
  });
});

describe("falhar lendo o CMR não derruba a lista do pedido", () => {
  it("⚠ o pedido continua aparecendo, só sem o abatimento do CMR", async () => {
    pedidoCom([{ descricao: "PORCA A563", qtd: 120, unidade: "PC", qtdRecebida: 15 }]);
    mockPrisma.documentoQualidade.findMany.mockRejectedValue(new Error("timeout"));
    const r = await itens();
    expect(r).toHaveLength(1);
    expect(r[0].qtdRecebida).toBe(15);
  });
});

// ⚠⚠ A ASPA ESCAPADA DO OMIE. Ele devolve `PORCA A563 - 3/8&quot; - GF`. A tela mostrava assim e —
// pior — era esse texto que ia para o lançamento do CMR e daí para a planilha do SharePoint,
// virando registro permanente com lixo de HTML. Medido em 17/09/2026: 369 dos 1.477 itens de
// pedido (25%) têm entidade na descrição.
describe("a descrição chega limpa de entidades HTML", () => {
  it("⚠⚠ &quot; vira aspa de verdade", async () => {
    pedidoCom([{ descricao: "PORCA A563 - 3/8&quot; - GF", qtd: 10, unidade: "PC", qtdRecebida: 0 }]);
    expect((await itens())[0].descricao).toBe('PORCA A563 - 3/8" - GF');
  });

  it("cobre as outras entidades comuns", async () => {
    pedidoCom([{ descricao: "CANT. 2&quot; &amp; 3&quot; &lt;A36&gt;", qtd: 1, unidade: "PC", qtdRecebida: 0 }]);
    expect((await itens())[0].descricao).toBe('CANT. 2" & 3" <A36>');
  });

  it("⚠ &amp; é desfeito POR ÚLTIMO — senão &amp;quot; viraria aspas", async () => {
    pedidoCom([{ descricao: "PECA &amp;quot; X", qtd: 1, unidade: "PC", qtdRecebida: 0 }]);
    expect((await itens())[0].descricao).toBe('PECA &quot; X');
  });

  it("⚠ o casamento com o CMR também normaliza — lançamento antigo com &quot; ainda abate", async () => {
    pedidoCom([{ descricao: 'PORCA A563 - 3/8&quot; - GF', qtd: 10, unidade: "PC", qtdRecebida: 0 }]);
    cmrCom([{ nome: 'PORCA A563 - 3/8" - GF', quantidade: 10, pesoKg: null }]);
    expect((await itens())[0].qtdRecebida).toBe(10);
  });

  it("descrição sem entidade passa intacta", async () => {
    pedidoCom([{ descricao: "CHAPA 3/16 ASTM A36", qtd: 1, unidade: "PC", qtdRecebida: 0 }]);
    expect((await itens())[0].descricao).toBe("CHAPA 3/16 ASTM A36");
  });
});
