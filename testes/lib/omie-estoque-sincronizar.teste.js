// `sincronizarProdutos` de ponta a ponta, com o Omie e o Prisma de mentira.
//
// ⚠⚠ O QUE ESTES TESTES GUARDAM (medido em produção, 24/09/2026):
//   · a Qtd era só o Almoxarifado — `qtdAtual` batia 657/657 com a posição SEM filtro de local;
//   · os 258 produtos da posição estavam TODOS com unidade "UN" (120 deles são KG, LATA, PC… no
//     cadastro): o `ListarPosEstoque` não traz `cUnidade`, e o update gravava o "UN" do fallback por
//     cima da unidade que o catálogo tinha acabado de gravar;
//   · uma página que falhasse virava `break` — e o passo seguinte ZERAVA quem não tinha sido lido.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
import { RESPOSTA_LOCAIS, LINHAS, paginaPosicao, ALMOXARIFADO, FABRICA, TERCEIRO, EDIFICACOES } from "@/testes/fixtures/omie-posicao-estoque";

const mocks = vi.hoisted(() => ({ omieCall: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/omie-call", () => ({ omieCall: mocks.omieCall, ORCAMENTO_ESGOTADO: "Orçamento de tempo esgotado" }));

import { sincronizarProdutos } from "@/lib/omie-estoque";

/** Uma página do `ListarProdutos` (o catálogo), no formato em que o Omie responde. */
const catalogo = (itens) => ({
  pagina: 1, total_de_paginas: 1, registros: itens.length, total_de_registros: itens.length,
  produto_servico_cadastro: itens.map(([codigo, descricao, unidade]) => ({
    codigo, codigo_produto: 1, codigo_produto_integracao: "", descricao, unidade,
    codigo_familia: 7318290001, descricao_familia: "MATERIA PRIMA", inativo: "N",
  })),
});

const CATALOGO = catalogo([
  ["101000002", "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 3,00MM", "KG"],
  ["301000045", "BARRA CHATA ACO CARBONO LAMINADA MULTINORMAS COMERCIAL DN. 3/16 X 1POL", "KG"],
]);

/** O Omie de mentira: responde pelo nome do método; a posição, pela página pedida. */
function omie({ locais = RESPOSTA_LOCAIS, paginas }) {
  mocks.omieCall.mockImplementation(async (_url, call, param) => {
    if (call === "ListarProdutos") return CATALOGO;
    if (call === "ListarLocaisEstoque") {
      if (locais instanceof Error) throw locais;
      return locais;
    }
    if (call === "ListarPosEstoque") {
      const p = paginas[param.nPagina - 1];
      if (p instanceof Error) throw p;
      return p;
    }
    throw new Error(`chamada inesperada ao Omie: ${call}`);
  });
}

const umaPagina = (linhas) => [paginaPosicao(linhas)];
const duasPaginas = (a, b) => [
  paginaPosicao(a, { nPagina: 1, nTotPaginas: 2, nTotRegistros: a.length + b.length }),
  paginaPosicao(b, { nPagina: 2, nTotPaginas: 2, nTotRegistros: a.length + b.length }),
];

/** O que o banco já tem — só o que a sincronização lê. */
const noBanco = (...itens) => mockPrisma.estoqueItem.findMany.mockResolvedValue(itens);
const item = (codigoOmie, qtdAtual = 0, locaisQtd = null) => ({ codigoOmie, qtdAtual, locaisQtd });

/** Toda gravação de `EstoqueItem` que mexeu em saldo. */
const gravacoesDeSaldo = () => [
  ...mockPrisma.estoqueItem.updateMany.mock.calls.map(([a]) => a),
  ...mockPrisma.estoqueItem.update.mock.calls.map(([a]) => a),
].filter((a) => a?.data && ("qtdAtual" in a.data || "locaisQtd" in a.data));

const gravacaoDe = (codigo) => mockPrisma.estoqueItem.updateMany.mock.calls
  .map(([a]) => a).find((a) => a.where?.codigoOmie === codigo);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.configEstoque.findFirst.mockResolvedValue({ id: "cfg", categoriasOmie: [] });
  mockPrisma.configEstoque.update.mockResolvedValue({});
  mockPrisma.estoqueItem.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.estoqueItem.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
  noBanco();
});

describe("sincronizarProdutos — a Qtd e o detalhe por local", () => {
  it("⚠⚠ grava a Qtd de Almoxarifado + Fábrica + Terceiro, o detalhe de CADA local e o CMC de onde o aço está", async () => {
    noBanco(item("101000002", -6480, {}), item("301000045", 320, {}));
    omie({ paginas: umaPagina([...LINHAS.chapa3, ...LINHAS.barra]) });

    await sincronizarProdutos();

    const chapa = gravacaoDe("101000002").data;
    expect(chapa.qtdAtual).toBeCloseTo(3071.89, 6); // era −6.480
    expect(chapa.locaisQtd).toEqual({ [ALMOXARIFADO]: -6480, [FABRICA]: 8159.29, [TERCEIRO]: 1392.6 });
    expect(chapa.cmc).toBeCloseTo(6.784558736, 5); // era 0 (o do Almoxarifado)
    expect(gravacaoDe("301000045").data.qtdAtual).toBe(320);
  });

  // Quebra que pega: voltar a gravar `unidade` a partir da posição (que não a tem).
  it("⚠⚠ não sobrescreve a unidade que o catálogo gravou — a posição não traz unidade", async () => {
    noBanco(item("101000002"), item("301000045"));
    omie({ paginas: umaPagina([...LINHAS.chapa3, ...LINHAS.barra]) });

    await sincronizarProdutos();

    const comUnidade = mockPrisma.estoqueItem.updateMany.mock.calls
      .map(([a]) => a).filter((a) => a.where?.codigoOmie && "unidade" in (a.data || {}));
    expect(comUnidade).toEqual([]);
  });

  it("guarda os seis locais do Omie na configuração, com quais entram na Qtd", async () => {
    omie({ paginas: umaPagina(LINHAS.barra) });

    await sincronizarProdutos();

    const { data } = mockPrisma.configEstoque.update.mock.calls.at(-1)[0];
    expect(data.ultimaSincProd).toBeInstanceOf(Date);
    expect(data.locaisOmie).toHaveLength(6);
    expect(data.locaisOmie.filter((l) => l.naQtd).map((l) => l.nome)).toEqual(["ESTOQUE ALMOXARIFADO", "ESTOQUE FABRICA", "ESTOQUE TERCEIRO"]);
  });

  // ⚠⚠ Quebra que pega: o filtro antigo (`qtdAtual > 0`) deixava o NEGATIVO de pé, e o produto que
  // só tinha saldo fora da Qtd (Qtd 0) ficava com o detalhe velho para sempre — saldo zero não vem na
  // posição, então sair dela é o jeito normal de um local zerar.
  it("⚠⚠ zera quem saiu da posição: o negativo e o que só tinha saldo fora da Qtd", async () => {
    noBanco(
      item("301000045", 320, { [ALMOXARIFADO]: 320 }),   // continua na posição
      item("NEGATIVO", -5, { [ALMOXARIFADO]: -5 }),        // saiu: negativo
      item("SO-PATRIMONIO", 0, { [EDIFICACOES]: 11 }),     // saiu: Qtd 0, detalhe velho
      item("JA-ZERADO", 0, null),                          // nada a fazer
      item("JA-VAZIO", 0, {}),                             // nada a fazer
    );
    omie({ paginas: umaPagina(LINHAS.barra) });

    await sincronizarProdutos();

    const zeragem = mockPrisma.estoqueItem.updateMany.mock.calls.map(([a]) => a)
      .find((a) => Array.isArray(a.where?.codigoOmie?.in));
    expect(zeragem.where.codigoOmie.in.sort()).toEqual(["NEGATIVO", "SO-PATRIMONIO"]);
    expect(zeragem.data).toEqual({ qtdAtual: 0, locaisQtd: {} });
  });
});

describe("sincronizarProdutos — falha do Omie aparece, e não apaga saldo", () => {
  // ⚠⚠ O DEFEITO MAIS CARO. Antes: a página 2 caía no `catch { break; }`, a posição ficava com a
  // página 1, e todo produto das outras páginas era ZERADO — em silêncio, com o cron verde.
  it("⚠⚠ página da posição que falha: LANÇA e não grava saldo de ninguém", async () => {
    noBanco(item("101000002", 3071.89, {}), item("501000055", 121493.8, {}));
    omie({ paginas: duasPaginas(LINHAS.chapa3, LINHAS.w610).map((p, i) => (i === 1 ? new Error("The operation was aborted due to timeout") : p)) });

    await expect(sincronizarProdutos()).rejects.toThrow(/timeout/);

    expect(gravacoesDeSaldo()).toEqual([]);
    expect(mockPrisma.estoqueItem.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.configEstoque.update).not.toHaveBeenCalled(); // "última sync" não avança
  });

  it("⚠ lista de locais que não vem: LANÇA antes de mexer em saldo", async () => {
    noBanco(item("301000045", 320, {}));
    omie({ locais: { error: "Client-Error" }, paginas: umaPagina(LINHAS.barra) });

    await expect(sincronizarProdutos()).rejects.toThrow(/locais/i);

    expect(gravacoesDeSaldo()).toEqual([]);
    expect(mockPrisma.configEstoque.update).not.toHaveBeenCalled();
  });

  // Quebra que pega: voltar a pedir a posição por local com `nCodLocal`, que o Omie recusa.
  it("pede a posição de TODOS os locais numa leitura só, sem `nCodLocal`", async () => {
    omie({ paginas: umaPagina(LINHAS.barra) });

    await sincronizarProdutos();

    const posicao = mocks.omieCall.mock.calls.filter(([, call]) => call === "ListarPosEstoque");
    expect(posicao).toHaveLength(1);
    expect(posicao[0][2]).toMatchObject({ lista_local_estoque: "TODOS" });
    expect(posicao[0][2]).not.toHaveProperty("nCodLocal");
  });
});
