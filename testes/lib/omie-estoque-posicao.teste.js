// ⚠⚠ ATÉ 25/09/2026 A "QTD" DO PORTAL ERA SÓ O ALMOXARIFADO. Medido ao vivo em 24/09: sem filtro de
// local, o `ListarPosEstoque` devolve só o local PADRÃO (258 linhas, byte a byte iguais às do
// Almoxarifado); com "TODOS", 810 linhas de 657 produtos. 399 produtos — chapas, perfis, tubos —
// nunca chegavam à tela, e 31 apareciam NEGATIVOS (a chapa 3,00 mm dizia −6.480 com 8.159 na Fábrica).
// A leitura por local nunca rodou: a lista de locais vinha de um serviço que não existe.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RESPOSTA_LOCAIS, LINHAS, paginaPosicao, ALMOXARIFADO, FABRICA, TERCEIRO, EDIFICACOES } from "@/testes/fixtures/omie-posicao-estoque";

const mocks = vi.hoisted(() => ({ omieCall: vi.fn() }));
vi.mock("@/lib/omie-call", () => ({ omieCall: mocks.omieCall, ORCAMENTO_ESGOTADO: "Orçamento de tempo esgotado" }));

import { consolidarPosicao, listarLocais, listarPosicao } from "@/lib/omie-estoque-posicao";

beforeEach(() => vi.clearAllMocks());

const produto = (mapa, cod) => mapa.get(cod);

describe("consolidarPosicao — uma linha por (produto, local) vira o saldo do produto", () => {
  // Quebra que pega: deixar o Terceiro fora (1.679,29), ficar com a última linha (1.392,6) ou
  // descartar o local negativo do detalhe.
  it("⚠⚠ a Qtd soma Almoxarifado + Fábrica + Terceiro; o detalhe guarda CADA local, negativo inclusive", () => {
    const p = produto(consolidarPosicao(LINHAS.chapa3), "101000002");
    expect(p.qtdAtual).toBeCloseTo(3071.89, 6); // −6.480 + 8.159,29 + 1.392,6
    expect(p.locaisQtd).toEqual({
      [ALMOXARIFADO]: -6480,
      [FABRICA]: 8159.29,
      [TERCEIRO]: 1392.6,
    });
    expect(p.descricao).toBe("CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 3,00MM");
  });

  // ⚠ Vitor (26/09/2026): "o material de terceiro sim é da Torg e pode ser usado". O W610 entrou no
  // Terceiro e foi baixado na Fábrica — sem o Terceiro na conta, sairia NEGATIVO.
  it("⚠ o Terceiro entra na Qtd: o consumo baixado na Fábrica desconta da entrada no Terceiro", () => {
    const p = produto(consolidarPosicao(LINHAS.w610), "501000055");
    expect(p.qtdAtual).toBeCloseTo(121493.8, 6); // −5.112,6 + 126.606,4
    expect(p.locaisQtd).toEqual({ [FABRICA]: -5112.6, [TERCEIRO]: 126606.4 });
  });

  // Quebra que pega: patrimônio (máquinas, ferramentas, edificações) somando como material de uso,
  // ou o produto sumindo da posição por não ter linha nos locais da Qtd.
  it("local de patrimônio fica fora da Qtd, mas o produto e o local aparecem no detalhe", () => {
    const p = produto(consolidarPosicao(LINHAS.luva), "181000031");
    expect(p.qtdAtual).toBe(0);
    expect(p.locaisQtd).toEqual({ [EDIFICACOES]: 11 });
  });

  it("consumível só no Almoxarifado continua como sempre foi", () => {
    const p = produto(consolidarPosicao(LINHAS.barra), "301000045");
    expect(p.qtdAtual).toBe(320);
    expect(p.cmc).toBeCloseTo(6.1425, 6);
    expect(p.locaisQtd).toEqual({ [ALMOXARIFADO]: 320 });
  });

  // ⚠⚠ O CMC É POR LOCAL (134 de 136 produtos em mais de um local têm CMC diferente). O portal
  // gravava o do Almoxarifado — para aço, 0 ou 1 R$/kg — e o custo de material o usava como preço.
  // Quebra que pega: usar o CMC do local padrão (458,08), a média simples (411,93) ou o da última linha.
  it("⚠⚠ o CMC é a média dos locais da Qtd, ponderada pelo saldo positivo de cada um", () => {
    const p = produto(consolidarPosicao(LINHAS.diluente), "701000003");
    expect(p.qtdAtual).toBe(40);
    expect(p.cmc).toBeCloseTo(453.4636974, 5); // (38 × 458,078892 + 2 × 365,775) ÷ 40
  });

  it("o Almoxarifado negativo não pesa no CMC: fica a média de Fábrica e Terceiro, onde o aço está", () => {
    // (8.159,29 × 6,962834 + 1.392,6 × 5,740038) ÷ 9.551,89
    expect(produto(consolidarPosicao(LINHAS.chapa3), "101000002").cmc).toBeCloseTo(6.784558736, 5);
  });

  // O degrau do meio da escada, com os dados do W610 e uma Qtd só da Fábrica (negativa).
  it("sem saldo positivo nos locais da Qtd, o CMC vem de onde houver saldo positivo", () => {
    const p = produto(consolidarPosicao(LINHAS.w610, new Set([String(FABRICA)])), "501000055");
    expect(p.cmc).toBeCloseTo(7.036942, 6);
  });

  // Quebra que pega: zerar o CMC de quem só tem saldo negativo — o custo de material usa este
  // CMC como preço quando não há compra recente, e perderia a referência que tem hoje.
  it("sem saldo positivo em lugar nenhum, fica o CMC que o Omie informar (como hoje)", () => {
    const p = produto(consolidarPosicao(LINHAS.escova), "901000026");
    expect(p.qtdAtual).toBe(-2);
    expect(p.cmc).toBeCloseTo(13.381429, 6);
  });

  it("sem saldo positivo e sem CMC no Omie, o CMC é 0 — nada de inventar custo", () => {
    const p = produto(consolidarPosicao(LINHAS.tubo), "201000006");
    expect(p.qtdAtual).toBe(-3230);
    expect(p.cmc).toBe(0);
  });

  it("os produtos não se misturam", () => {
    const m = consolidarPosicao([...LINHAS.chapa3, ...LINHAS.barra, ...LINHAS.w610]);
    expect([...m.keys()].sort()).toEqual(["101000002", "301000045", "501000055"]);
  });
});

describe("listarLocais — o cadastro de locais do Omie", () => {
  // Quebra que pega: voltar ao `estoque/localestoque/` (não existe: a doc dá 404, e a chamada
  // estourou os 3 s ou voltou `{error}`), aos parâmetros `pagina`/`registros_por_pagina` ou às
  // chaves `listaLocaisEstoque`/`cDescricao` — as três coisas que zeravam a lista.
  it("pergunta ao serviço estoque/local e devolve código, nome, padrão e se entra na Qtd", async () => {
    mocks.omieCall.mockResolvedValueOnce(RESPOSTA_LOCAIS);
    const locais = await listarLocais();
    const [url, call, param] = mocks.omieCall.mock.calls[0];
    expect(url).toBe("https://app.omie.com.br/api/v1/estoque/local/");
    expect(call).toBe("ListarLocaisEstoque");
    expect(param).toMatchObject({ nPagina: 1 });
    expect(param.nRegPorPagina).toBeGreaterThanOrEqual(6);
    expect(locais).toHaveLength(6);
    expect(locais.slice(0, 4)).toEqual([
      { cod: ALMOXARIFADO, nome: "ESTOQUE ALMOXARIFADO", padrao: true, naQtd: true },
      { cod: FABRICA, nome: "ESTOQUE FABRICA", padrao: false, naQtd: true },
      { cod: TERCEIRO, nome: "ESTOQUE TERCEIRO", padrao: false, naQtd: true },
      { cod: 7756631248, nome: "MAQUINAS E EQUIPAMENTOS", padrao: false, naQtd: false },
    ]);
    expect(locais.filter((l) => l.naQtd).map((l) => l.cod)).toEqual([ALMOXARIFADO, FABRICA, TERCEIRO]);
  });

  // ⚠⚠ ERA ASSIM QUE A FALHA SUMIA: HTTP 200, JSON sem `faultstring` — o `omieCall` devolve como
  // sucesso — e a lista vazia virava "não há locais".
  it("⚠⚠ resposta sem `locaisEncontrados` LANÇA — não vira lista vazia", async () => {
    mocks.omieCall.mockResolvedValueOnce({ error: "Client-Error: método não encontrado" });
    await expect(listarLocais()).rejects.toThrow(/locais/i);
  });

  it("erro do Omie chega a quem chamou, com o motivo do Omie", async () => {
    mocks.omieCall.mockRejectedValueOnce(new Error("SOAP-ERROR: Broken response from Application Server"));
    await expect(listarLocais()).rejects.toThrow(/Broken response/);
  });

  // ⚠⚠ Quebra que pega: local da Qtd apagado ou recriado no Omie (o código muda). Os códigos são fixos
  // em LOCAIS_NA_QTD — sem esta trava, a Qtd de tudo o que está naquele local cairia a zero, calada.
  it("⚠⚠ local da Qtd que não existe mais no cadastro do Omie LANÇA, dizendo qual", async () => {
    mocks.omieCall.mockResolvedValueOnce({
      ...RESPOSTA_LOCAIS,
      locaisEncontrados: RESPOSTA_LOCAIS.locaisEncontrados.filter((l) => l.codigo_local_estoque !== FABRICA),
    });
    await expect(listarLocais()).rejects.toThrow(String(FABRICA));
  });
});

describe("listarPosicao — a posição de TODOS os locais, inteira ou nada", () => {
  const p1 = [...LINHAS.chapa3, ...LINHAS.barra];            // 4 linhas
  const p2 = [...LINHAS.w610, ...LINHAS.tubo];               // 3 linhas
  const duasPaginas = () => {
    mocks.omieCall
      .mockResolvedValueOnce(paginaPosicao(p1, { nPagina: 1, nTotPaginas: 2, nTotRegistros: 7 }))
      .mockResolvedValueOnce(paginaPosicao(p2, { nPagina: 2, nTotPaginas: 2, nTotRegistros: 7 }));
  };

  // Quebra que pega: esquecer o "TODOS" (volta a ser só o Almoxarifado), mandar `nCodLocal`
  // (o Omie recusa: "Tag [NCODLOCAL] não faz parte da estrutura") ou parar na página 1.
  it("⚠⚠ pede lista_local_estoque \"TODOS\" e lê até a última página", async () => {
    duasPaginas();
    const linhas = await listarPosicao({ dataPosicao: "24/09/2026" });
    expect(linhas).toHaveLength(7);
    expect(mocks.omieCall).toHaveBeenCalledTimes(2);
    mocks.omieCall.mock.calls.forEach(([url, call, param], i) => {
      expect(url).toBe("https://app.omie.com.br/api/v1/estoque/consulta/");
      expect(call).toBe("ListarPosEstoque");
      expect(param).toMatchObject({ nPagina: i + 1, dDataPosicao: "24/09/2026", lista_local_estoque: "TODOS" });
      expect(param).not.toHaveProperty("nCodLocal");
      expect(param).not.toHaveProperty("codigo_local_estoque");
    });
  });

  // ⚠⚠ O DEFEITO MAIS CARO: `catch { break; }` devolvia a página 1 como se fosse tudo, e o passo
  // seguinte ZERAVA o saldo de todo produto que não estava nela.
  it("⚠⚠ página que falha LANÇA — nunca devolve a posição pela metade", async () => {
    mocks.omieCall
      .mockResolvedValueOnce(paginaPosicao(p1, { nPagina: 1, nTotPaginas: 2, nTotRegistros: 7 }))
      .mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
    await expect(listarPosicao({ dataPosicao: "24/09/2026" })).rejects.toThrow(/timeout/);
  });

  it("⚠ página sem `produtos` ou sem `nTotPaginas` LANÇA — `{}` não é posição vazia", async () => {
    mocks.omieCall.mockResolvedValueOnce({});
    await expect(listarPosicao({ dataPosicao: "24/09/2026" })).rejects.toThrow();
  });

  it("⚠ menos linhas do que o Omie disse que tinha LANÇA", async () => {
    mocks.omieCall
      .mockResolvedValueOnce(paginaPosicao(p1, { nPagina: 1, nTotPaginas: 2, nTotRegistros: 9 }))
      .mockResolvedValueOnce(paginaPosicao(p2, { nPagina: 2, nTotPaginas: 2, nTotRegistros: 9 }));
    await expect(listarPosicao({ dataPosicao: "24/09/2026" })).rejects.toThrow(/7.*9|9.*7/);
  });

  // ⚠ O servidor roda em UTC: às 22h30 de Brasília já é o dia seguinte lá. Quebra que pega: montar a
  // data com `getDate()` do servidor (o `hoje()` de antes) — o botão "Sincronizar" à noite pediria a
  // posição de amanhã.
  it("sem data informada, usa o dia de hoje EM BRASÍLIA, não o do servidor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T01:30:00Z")); // 24/09, 22h30 em Brasília
    try {
      mocks.omieCall.mockResolvedValueOnce(paginaPosicao(LINHAS.barra));
      await listarPosicao();
      expect(mocks.omieCall.mock.calls[0][2].dDataPosicao).toBe("24/09/2026");
    } finally {
      vi.useRealTimers();
    }
  });
});
