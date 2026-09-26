// Movimentações de estoque do Omie → EstoqueMovimentacao, com o Omie e o Prisma mockados.
//
// ⚠⚠ O DEFEITO QUE ESTE ARQUIVO TRAVA (24/09/2026): a sincronização chamava `ListarMovEstoque` em
// `estoque/movestoque/`, e esse método NÃO EXISTE — o Omie respondia `Method "ListarMovEstoque" not
// exists`. O laço fazia `catch { break; }` e lia `resp.movimentos || []`, então o erro virava
// "0 movimentos, sucesso": `EstoqueMovimentacao` tinha 0 linhas desde sempre e o cron seguia verde.
//
// O método certo é `ListarMovimentoEstoque`, em `estoque/consulta/` (o mesmo serviço do
// `ListarPosEstoque`). Formato conferido numa chamada de leitura ao vivo em 24/09/2026: lista em
// `movProdutoListar`, `idMov` único por linha (um por item da nota), produto como `idProd`
// NUMÉRICO (o `nCodProd`, não o código em texto que o portal guarda), `tipo` "entrada"/"saida",
// datas "dd/mm/aaaa", `cmc` já depois do movimento. Os valores abaixo seguem esse formato.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ omie: vi.fn(), alocar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/omie-call", () => ({ omieCall: mocks.omie, ORCAMENTO_ESGOTADO: "Orçamento de tempo esgotado" }));
vi.mock("@/lib/estoque-alocacao", () => ({ aplicarAlocacaoMovimentacao: mocks.alocar }));

import { sincronizarMovimentacoes } from "@/lib/omie-estoque-movimentos";

const URL_CONSULTA = "https://app.omie.com.br/api/v1/estoque/consulta/";

/** Uma linha de `movProdutoListar`, no formato que o Omie devolveu ao vivo. */
const movimento = (o = {}) => ({
  idMov: 7829754324, idItem: 7828839407, idProd: 7318300297,
  dtMov: "21/09/2026", dtEmissao: "21/09/2026",
  codOrigem: "COM", desOrigem: "Compra de Produto", operacao: "21",
  tipo: "entrada", cancelamento: "N", devolucao: "N",
  codigo_local_estoque: 7315778267, qtde: 150, cmc: 3.608464, valor: 3.6084, saldo: 404,
  numDoc: "000040182", numPedido: "", idDoc: 7829754316, idRecebimento: 7828900606,
  descricao: "DISCO DE DESBASTE 4.1/2&quot;",
  ...o,
});

const pagina = (movs, { nPagina = 1, nTotPaginas = 1, nTotRegistros = movs.length } = {}) => ({
  nPagina, nTotPaginas, nRegistros: movs.length, nTotRegistros, movProdutoListar: movs,
});

/** O cadastro local: idProd (nCodProd) → código do produto → EstoqueItem. */
const PRODUTOS = [
  { codigo: "301000010", codigoOmie: "7318300297", atualizadoEm: new Date("2026-09-21T05:00:00Z") },
  { codigo: "101000007", codigoOmie: "7318291771", atualizadoEm: new Date("2026-09-21T05:00:00Z") },
];
const ITENS = [
  { id: "item-disco", codigoOmie: "301000010" },
  { id: "item-chapa", codigoOmie: "101000007" },
];

/** Responde o Omie pelo NOME do método — a ordem das chamadas não importa ao teste. */
function omieResponde({ paginas = [pagina([movimento()])], consultar } = {}) {
  mocks.omie.mockImplementation(async (url, call, param) => {
    if (call === "ListarMovimentoEstoque") {
      const p = paginas[(param?.nPagina || 1) - 1];
      if (p instanceof Error) throw p;
      return p;
    }
    if (call === "ConsultarProduto") {
      if (!consultar) throw new Error("ConsultarProduto não esperado");
      return consultar(param);
    }
    throw new Error(`Method "${call}" not exists`);
  });
}

const criados = () => mockPrisma.estoqueMovimentacao.create.mock.calls.map(([a]) => a.data);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.omie.mockReset();
  mocks.alocar.mockReset();
  mocks.alocar.mockResolvedValue({ alocadas: 1, sobra: 0 });
  // ⚠ Só o relógio é falso: o intervalo entre páginas usa setTimeout de verdade.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T15:00:00Z")); // 12h de 24/09 em Brasília
  mockPrisma.configEstoque.findFirst.mockResolvedValue({ id: "cfg1" });
  mockPrisma.configEstoque.update.mockResolvedValue({});
  mockPrisma.estoqueMovimentacao.findMany.mockResolvedValue([]);
  mockPrisma.produtoOmie.findMany.mockImplementation(async ({ where }) =>
    PRODUTOS.filter((p) => where.codigoOmie.in.includes(p.codigoOmie)));
  mockPrisma.estoqueItem.findMany.mockImplementation(async ({ where }) =>
    ITENS.filter((i) => where.codigoOmie.in.includes(i.codigoOmie)));
  mockPrisma.estoqueMovimentacao.create.mockImplementation(async ({ data }) => ({ id: `id-${data.syncCodigoOmie}`, ...data }));
  omieResponde();
});

const TZ_ORIGINAL = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
  // ⚠ `process.env.TZ = undefined` grava a STRING "undefined" — e vaza para os próximos arquivos.
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

describe("sincronizarMovimentacoes — o método e os parâmetros certos", () => {
  it("chama ListarMovimentoEstoque em estoque/consulta, janela em dias de Brasília, todos os locais", async () => {
    await sincronizarMovimentacoes(2);
    const [url, call, param] = mocks.omie.mock.calls[0];
    expect(url).toBe(URL_CONSULTA);
    expect(call).toBe("ListarMovimentoEstoque");
    expect(param).toEqual({
      nPagina: 1, nRegPorPagina: 50,
      dDtInicial: "22/09/2026", dDtFinal: "24/09/2026",
      lista_local_estoque: "TODOS",
    });
  });

  // ⚠ Às 22h30 de Brasília o relógio UTC já virou o dia. A janela é do dia da OPERAÇÃO — e o
  // servidor da Vercel roda em UTC, então o teste também roda: numa máquina em Brasília o
  // `getDate()` local acertaria por acaso (foi o que o código antigo fez passar aqui).
  it("fim do dia em Brasília não empurra a janela para amanhã", async () => {
    process.env.TZ = "UTC";
    vi.setSystemTime(new Date("2026-09-25T01:30:00Z")); // 22h30 de 24/09 em Brasília
    await sincronizarMovimentacoes(2);
    expect(mocks.omie.mock.calls[0][2]).toMatchObject({ dDtInicial: "22/09/2026", dDtFinal: "24/09/2026" });
  });

  it("passa o prazo absoluto para o omieCall — é ele que corta a conexão pendurada", async () => {
    const ateMs = Date.now() + 40_000;
    await sincronizarMovimentacoes(2, { ateMs });
    expect(mocks.omie.mock.calls[0][3]).toMatchObject({ ateMs });
  });
});

describe("sincronizarMovimentacoes — os campos lidos", () => {
  it("grava a entrada com item, tipo, quantidade, data, CMC e a chave do movimento", async () => {
    const r = await sincronizarMovimentacoes(2);
    expect(criados()).toEqual([{
      itemEstoqueId: "item-disco",
      tipo: "ENTRADA",
      origem: "OMIE_NF",
      quantidade: 150,
      cmcMomento: 3.608464,
      observacao: "Compra de Produto · NF 000040182",
      syncCodigoOmie: "omie-7829754324",
      // ⚠ meio-dia UTC: o mesmo dia-calendário em UTC e em Brasília (convenção de lib/cmr.js)
      createdAt: new Date("2026-09-21T12:00:00.000Z"),
    }]);
    expect(r).toMatchObject({ entradas: 1, saidas: 0, total: 1, lidos: 1, jaExistiam: 0 });
    expect(mocks.alocar).not.toHaveBeenCalled();
    expect(mockPrisma.configEstoque.update).toHaveBeenCalledWith({
      where: { id: "cfg1" }, data: { ultimaSincMov: expect.any(Date) },
    });
  });

  const saidaDeProducao = () => pagina([movimento({
    idMov: 7830000001, idProd: 7318291771, tipo: "saida", operacao: "28", codOrigem: "OPR",
    desOrigem: "Ordem de Produção", qtde: 936, cmc: 5.299816, numDoc: "", idDoc: 0,
  })]);

  // ⚠⚠ DECISÃO DO VITOR (26/09/2026): as saídas sobem SEM abater as reservas das OPs, até definirmos
  // quais saídas são consumo de verdade. A alocação FIFO nunca rodou em produção.
  it("saída vira SAIDA e, por padrão, NÃO abate reserva de OP", async () => {
    omieResponde({ paginas: [saidaDeProducao()] });
    const r = await sincronizarMovimentacoes(2);
    expect(criados()[0]).toMatchObject({
      itemEstoqueId: "item-chapa", tipo: "SAIDA", origem: "OMIE_BAIXA", quantidade: 936,
      observacao: "Ordem de Produção",
    });
    expect(mocks.alocar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ entradas: 0, saidas: 1 });
  });

  it("com `abaterReservas`, a saída dispara a alocação FIFO nas reservas das OPs", async () => {
    omieResponde({ paginas: [saidaDeProducao()] });
    await sincronizarMovimentacoes(2, { abaterReservas: true });
    expect(mocks.alocar).toHaveBeenCalledWith("id-omie-7830000001");
  });

  // ⚠⚠ Estorno não é consumo: a saída que desfaz uma nota de ENTRADA cancelada não pode abater a
  // reserva de uma OP — o material nunca chegou. Vale MESMO com a alocação ligada.
  it("saída de cancelamento/devolução de nota é gravada, mas não abate reserva", async () => {
    omieResponde({ paginas: [pagina([
      movimento({ idMov: 1, tipo: "saida", cancelamento: "S" }),
      movimento({ idMov: 2, tipo: "saida", devolucao: "S", operacao: "23", desOrigem: "Devolução ao Fornecedor" }),
    ])] });
    const r = await sincronizarMovimentacoes(2, { abaterReservas: true });
    expect(criados().map((d) => d.tipo)).toEqual(["SAIDA", "SAIDA"]);
    expect(criados()[0].observacao).toContain("cancelamento");
    // ⚠ rotulada "Baixa (produção)", diria que a fábrica consumiu material que nunca chegou
    expect(criados().map((d) => d.origem)).toEqual(["OMIE_NF", "OMIE_NF"]);
    expect(mocks.alocar).not.toHaveBeenCalled();
    expect(r.saidas).toBe(2);
  });

  it("ajuste de estoque (operação 00) sai como MANUAL, não como nota fiscal", async () => {
    omieResponde({ paginas: [pagina([movimento({ operacao: "00", codOrigem: "AJU", desOrigem: "Ajuste no estoque", numDoc: "", idDoc: 0 })])] });
    await sincronizarMovimentacoes(2);
    expect(criados()[0]).toMatchObject({ tipo: "ENTRADA", origem: "MANUAL", observacao: "Ajuste no estoque" });
  });

  it("quantidade negativa vem em módulo; o sentido é o `tipo`", async () => {
    omieResponde({ paginas: [pagina([movimento({ tipo: "saida", qtde: -12.5 })])] });
    await sincronizarMovimentacoes(2);
    expect(criados()[0]).toMatchObject({ tipo: "SAIDA", quantidade: 12.5 });
  });

  it("movimento sem quantidade (nota complementar de valor) é pulado sem erro", async () => {
    omieResponde({ paginas: [pagina([movimento({ qtde: 0, operacao: "26" })])] });
    const r = await sincronizarMovimentacoes(2);
    expect(criados()).toEqual([]);
    expect(r).toMatchObject({ total: 0, semQuantidade: 1 });
  });

  it("movimento já gravado não é gravado de novo", async () => {
    mockPrisma.estoqueMovimentacao.findMany.mockResolvedValue([{ syncCodigoOmie: "omie-7829754324" }]);
    const r = await sincronizarMovimentacoes(2);
    expect(mockPrisma.estoqueMovimentacao.create).not.toHaveBeenCalled();
    expect(r).toMatchObject({ total: 0, jaExistiam: 1 });
  });

  it("percorre todas as páginas", async () => {
    omieResponde({ paginas: [
      pagina([movimento({ idMov: 11 })], { nPagina: 1, nTotPaginas: 2, nTotRegistros: 2 }),
      pagina([movimento({ idMov: 12 })], { nPagina: 2, nTotPaginas: 2, nTotRegistros: 2 }),
    ] });
    const r = await sincronizarMovimentacoes(2);
    expect(mocks.omie.mock.calls.map((c) => c[2].nPagina)).toEqual([1, 2]);
    expect(criados().map((d) => d.syncCodigoOmie)).toEqual(["omie-11", "omie-12"]);
    expect(r).toMatchObject({ paginas: 2, total: 2 });
  });
});

describe("sincronizarMovimentacoes — o produto (idProd numérico → código do portal)", () => {
  // ⚠ Produto novo nasce na entrada da nota e o cache `ProdutoOmie` é SEMANAL: sem a consulta, o
  // movimento dele cairia fora da janela de 2 dias antes de o cache saber que ele existe.
  it("produto fora do cache semanal é consultado no Omie pelo codigo_produto", async () => {
    omieResponde({
      paginas: [pagina([movimento({ idProd: 7828050860 })])],
      consultar: async (p) => ({ codigo_produto: p.codigo_produto, codigo: "301000010" }),
    });
    await sincronizarMovimentacoes(2);
    const consulta = mocks.omie.mock.calls.find((c) => c[1] === "ConsultarProduto");
    expect(consulta[0]).toBe("https://app.omie.com.br/api/v1/geral/produtos/");
    expect(consulta[2]).toEqual({ codigo_produto: 7828050860 });
    expect(criados()[0].itemEstoqueId).toBe("item-disco");
  });

  // ⚠ Código trocado no Omie deixa a linha velha no cache com o MESMO nCodProd.
  it("duas linhas do cache com o mesmo nCodProd: vale a atualizada por último", async () => {
    mockPrisma.produtoOmie.findMany.mockResolvedValue([
      { codigo: "101000007", codigoOmie: "7318300297", atualizadoEm: new Date("2026-09-21T05:00:00Z") },
      { codigo: "301000010", codigoOmie: "7318300297", atualizadoEm: new Date("2026-08-03T05:00:00Z") },
    ]);
    await sincronizarMovimentacoes(2);
    expect(criados()[0].itemEstoqueId).toBe("item-chapa");
  });
});

describe("sincronizarMovimentacoes — a falha APARECE", () => {
  // ⚠⚠ O defeito original: erro do Omie virava "0 movimentos, sucesso".
  it("erro do Omie rejeita — não vira 0 movimentos com sucesso", async () => {
    omieResponde({ paginas: [new Error('Method "ListarMovimentoEstoque" not exists')] });
    await expect(sincronizarMovimentacoes(2)).rejects.toThrow(/not exists/);
    expect(mockPrisma.configEstoque.update).not.toHaveBeenCalled();
  });

  it("erro na 2ª página rejeita e diz o que já foi gravado", async () => {
    omieResponde({ paginas: [
      pagina([movimento({ idMov: 11 })], { nPagina: 1, nTotPaginas: 2, nTotRegistros: 2 }),
      new Error("SOAP-ERROR: Broken response"),
    ] });
    const erro = await sincronizarMovimentacoes(2).catch((e) => e);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toMatch(/página 2/);
    expect(erro.message).toMatch(/1 movimento\(s\) gravado\(s\)/);
    expect(criados()).toHaveLength(1); // o que já entrou fica — a chave impede duplicar depois
    expect(mockPrisma.configEstoque.update).not.toHaveBeenCalled();
  });

  // ⚠ Ausência de campo não é campo com zero (a lição de lib/omie-encerramento.js).
  it("resposta sem a lista e sem total não é 'nenhum movimento'", async () => {
    omieResponde({ paginas: [{}] });
    await expect(sincronizarMovimentacoes(2)).rejects.toThrow(/movProdutoListar/);
  });

  it("lista com outro nome e total > 0 também rejeita", async () => {
    omieResponde({ paginas: [{ nPagina: 1, nTotPaginas: 1, nTotRegistros: 3, movimentos: [movimento()] }] });
    await expect(sincronizarMovimentacoes(2)).rejects.toThrow(/movProdutoListar/);
  });

  it("janela sem movimento ('Não existem registros') é sucesso com zero", async () => {
    omieResponde({ paginas: [new Error("ERROR: Não existem registros para a página [1]!")] });
    const r = await sincronizarMovimentacoes(2);
    expect(r).toMatchObject({ total: 0, lidos: 0 });
    expect(mockPrisma.configEstoque.update).toHaveBeenCalled();
  });

  it("janela sem movimento com total zero explícito também é sucesso", async () => {
    omieResponde({ paginas: [{ nPagina: 1, nTotPaginas: 0, nRegistros: 0, nTotRegistros: 0 }] });
    await expect(sincronizarMovimentacoes(2)).resolves.toMatchObject({ total: 0 });
  });

  it("movimento que não pôde ser gravado rejeita no fim — sem perder os outros", async () => {
    omieResponde({
      paginas: [pagina([movimento({ idMov: 21 }), movimento({ idMov: 22, idProd: 999 })])],
      consultar: async () => { throw new Error("Produto não cadastrado"); },
    });
    const erro = await sincronizarMovimentacoes(2).catch((e) => e);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toMatch(/NÃO gravad/);
    expect(erro.message).toContain("999");
    expect(criados().map((d) => d.syncCodigoOmie)).toEqual(["omie-21"]);
    expect(erro.resumo).toMatchObject({ entradas: 1, naoGravados: 1 });
  });

  it("produto sem EstoqueItem (catálogo ainda não rodou) também aparece", async () => {
    mockPrisma.estoqueItem.findMany.mockResolvedValue([]);
    await expect(sincronizarMovimentacoes(2)).rejects.toThrow(/sem item de estoque/);
  });

  it("tipo que o Omie não documenta aparece, em vez de virar AJUSTE inventado", async () => {
    omieResponde({ paginas: [pagina([movimento({ tipo: "transferencia" })])] });
    await expect(sincronizarMovimentacoes(2)).rejects.toThrow(/tipo/);
    expect(criados()).toEqual([]);
  });

  it("falha na alocação FIFO aparece — antes era `.catch(() => {})`", async () => {
    omieResponde({ paginas: [pagina([movimento({ tipo: "saida" })])] });
    mocks.alocar.mockRejectedValue(new Error("deadlock"));
    const erro = await sincronizarMovimentacoes(2, { abaterReservas: true }).catch((e) => e);
    expect(erro.message).toMatch(/aloca/i);
    expect(criados()).toHaveLength(1); // o movimento em si foi gravado
  });

  it("prazo já vencido não chama o Omie e diz por quê", async () => {
    const erro = await sincronizarMovimentacoes(2, { ateMs: Date.now() - 1 }).catch((e) => e);
    expect(erro.message).toMatch(/tempo esgotado antes da página 1 —/);
    expect(mocks.omie).not.toHaveBeenCalled();
  });

  // Registro de controle não derruba uma rodada cujos movimentos já estão gravados.
  it("falha ao gravar ultimaSincMov não transforma a rodada em falha", async () => {
    mockPrisma.configEstoque.update.mockRejectedValue(new Error("P1001 Can't reach database server"));
    await expect(sincronizarMovimentacoes(2)).resolves.toMatchObject({ total: 1 });
  });
});
