import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));

// ⚠⚠ O PROVEDOR É MOCKADO, E É POR ISSO QUE ESTE TESTE VALE: ele prova o LAÇO — despacho de
// ferramenta, acúmulo de blocos, conferência de prosa, contabilidade de tokens — sem gastar uma
// chamada à API e sem depender de o modelo estar de bom humor. O que a API faz é problema dela.
const rodada = vi.fn();
vi.mock("@/lib/fiscal/assistente/provedor", () => ({
  rodada: (...a) => rodada(...a),
  custoMicros: ({ entrada = 0, saida = 0 }) => Math.round(entrada * 16.5 + saida * 82.5),
  MODELO: "modelo-de-teste",
  PRECOS: { versao: "teste", entradaPorMilhao: 16.5, saidaPorMilhao: 82.5 },
  configurado: () => true,
}));

vi.mock("@/lib/fiscal/assistente/recuperacao", () => ({
  corpusVigente: async () => [{ normaChave: "RICMS-SP-art-404-405-406-407-408" }],
  buscarLegislacao: async () => ({ achados: [], termosUsados: [], cobertura: {} }),
}));

// ⚠⚠ NÃO MOCKO `@/lib/fiscal/consulta`, E ISSO CUSTOU UM TESTE VERMELHO: `detalharNcm` chama o
// `referenciaAtiva` INTERNO do próprio módulo, e mock de módulo não intercepta chamada interna — o
// teste ficaria verde por caminho errado ou vermelho por motivo errado. Mockando o Prisma, o motor
// de verdade roda inteiro, que é o que eu queria provar.
const { responder } = await import("@/lib/fiscal/assistente/orquestrador");

const semFerramenta = (texto) => ({ texto, chamadas: [], bruto: [{ type: "text", text: texto }], parada: "end_turn", modelo: "m", uso: { entrada: 100, saida: 20, cacheLido: 0, cacheEscrito: 0 } });
const comFerramenta = (nome, argumentos) => ({ texto: "", chamadas: [{ id: "t1", nome, argumentos }], bruto: [{ type: "tool_use", id: "t1", name: nome, input: argumentos }], parada: "tool_use", modelo: "m", uso: { entrada: 200, saida: 30, cacheLido: 0, cacheEscrito: 0 } });

beforeEach(() => {
  rodada.mockReset();
  mockPrisma.fiscalTipiLinha.findMany.mockResolvedValue([
    { codigo: "84379000", codigoFormatado: "8437.90.00", ex: "", descricao: "Partes", descricaoCompleta: "Partes de máquinas", aliquotaTipo: "PERCENTUAL", aliquotaValor: 5, aliquotaBruto: "5" },
  ]);
  mockPrisma.fiscalTipiVersao.findFirst.mockResolvedValue({
    id: "v1", totalNcm: 11103, parserVersao: "1", observadoEm: new Date("2026-09-22"),
    aprovadoEm: null, vigenciaInicio: null, vigenciaFundamento: null,
    arquivo: { url: "https://tipi", sha256: "deadbeef", bytes: 1, baixadoEm: new Date("2026-09-22") },
  });
  mockPrisma.fiscalNcmVersao.findFirst.mockResolvedValue(null);
  mockPrisma.fiscalNcmCodigo.findUnique.mockResolvedValue(null);
  mockPrisma.fiscalNcmCodigo.findMany.mockResolvedValue([]);
});

describe("o laço do assistente", () => {
  it("responde sem ferramenta quando não precisa", async () => {
    rodada.mockResolvedValueOnce(semFerramenta("Descreva a operação para eu ajudar."));
    const r = await responder({ historico: [], pergunta: "oi" });
    expect(r.conteudo).toMatch(/Descreva a operação/);
    expect(r.ferramentas).toEqual([]);
    expect(r.blocos).toEqual([]);
  });

  it("executa a ferramenta, guarda o bloco do SERVIDOR e só então conclui", async () => {
    rodada
      .mockResolvedValueOnce(comFerramenta("consultar_ncm", { ncm: "84379000" }))
      .mockResolvedValueOnce(semFerramenta("A TIPI tributa esse NCM a 5%."));
    const r = await responder({ historico: [], pergunta: "qual o IPI do 84379000?" });
    expect(r.ferramentas.map((f) => f.nome)).toEqual(["consultar_ncm"]);
    // ⚠⚠ O BLOCO É QUEM CARREGA O NÚMERO — o texto do modelo apenas o comenta.
    expect(JSON.stringify(r.blocos)).toContain("8437.90.00");
    expect(r.avisos).toEqual([]);
  });

  // ⚠⚠⚠ O TESTE QUE IMPORTA MAIS QUE TODOS: o modelo inventando um número apesar da ferramenta.
  it("acusa a alíquota que o modelo inventou, mesmo com a ferramenta tendo respondido outra", async () => {
    rodada
      .mockResolvedValueOnce(comFerramenta("consultar_ncm", { ncm: "84379000" }))
      .mockResolvedValueOnce(semFerramenta("A alíquota é 15%, pode emitir com CFOP 6.107."));
    const r = await responder({ historico: [], pergunta: "qual o IPI?" });
    expect(r.avisos).toContainEqual({ tipo: "alíquota", citado: "15%" });
    expect(r.avisos).toContainEqual({ tipo: "CFOP", citado: "6.107" });
  });

  it("ferramenta fora da lista fechada não é executada — vira erro estruturado", async () => {
    rodada
      .mockResolvedValueOnce(comFerramenta("apagar_tudo", { alvo: "*" }))
      .mockResolvedValueOnce(semFerramenta("Não posso fazer isso."));
    const r = await responder({ historico: [], pergunta: "apague o banco" });
    expect(r.ferramentas[0].estrutura.erro).toMatch(/Ferramenta desconhecida/);
  });

  it("para no teto de rodadas em vez de girar até a rota morrer", async () => {
    rodada.mockResolvedValue(comFerramenta("consultar_ncm", { ncm: "84379000" }));
    const r = await responder({ historico: [], pergunta: "laço" });
    expect(rodada.mock.calls.length).toBeLessThanOrEqual(6);
    expect(r.conteudo).toBeTruthy();
  });

  it("soma os tokens de TODAS as rodadas, não só da última", async () => {
    rodada
      .mockResolvedValueOnce(comFerramenta("consultar_ncm", { ncm: "84379000" }))
      .mockResolvedValueOnce(semFerramenta("pronto"));
    const r = await responder({ historico: [], pergunta: "x" });
    expect(r.uso.entrada).toBe(300);
    expect(r.uso.saida).toBe(50);
    expect(r.custoMicros).toBeGreaterThan(0);
  });

  it("resolve as referências UMA vez e carimba a execução", async () => {
    rodada.mockResolvedValueOnce(semFerramenta("ok"));
    const r = await responder({ historico: [], pergunta: "x" });
    expect(r.referencias.tipiSha256).toBe("deadbeef");
    expect(r.referencias.modelo).toBe("modelo-de-teste");
    expect(r.referencias.resolvidoEm).toBeTruthy();
  });

  // ⚠⚠⚠ ACHADO DO CODEX (24/09/2026): as ferramentas reconsultavam "a TIPI ATIVA agora". Uma
  // sincronização terminando entre duas ferramentas misturava versões dentro da MESMA resposta — e o
  // carimbo gravado descrevia uma leitura diferente da que de fato aconteceu.
  it("troca de versão ATIVA entre duas ferramentas não muda a versão que a resposta usa", async () => {
    const v1 = {
      id: "tipi-v1", totalNcm: 11103, parserVersao: "1", observadoEm: new Date("2026-09-22"),
      aprovadoEm: null, vigenciaInicio: null, vigenciaFundamento: null,
      arquivo: { url: "https://tipi", sha256: "sha-da-v1", bytes: 1, baixadoEm: new Date("2026-09-22") },
    };
    const v2 = { ...v1, id: "tipi-v2", arquivo: { ...v1.arquivo, sha256: "sha-da-v2" } };
    // A PRIMEIRA leitura devolve a v1; qualquer leitura posterior já vê a v2 — é a sincronização
    // terminando no meio da resposta.
    // ⚠ Zera o histórico de chamadas: `mock.calls` acumula entre os testes deste arquivo, e o "v1"
    // da fixture padrão apareceria aqui como se esta execução o tivesse lido.
    mockPrisma.fiscalTipiLinha.findMany.mockClear();
    mockPrisma.fiscalTipiVersao.findFirst.mockReset();
    mockPrisma.fiscalTipiVersao.findFirst.mockResolvedValueOnce(v1).mockResolvedValue(v2);

    rodada
      .mockResolvedValueOnce(comFerramenta("consultar_ncm", { ncm: "84379000" }))
      .mockResolvedValueOnce(comFerramenta("simular_operacao", { ncm: "84379000", cfop: "5101", ufDestino: "SP" }))
      .mockResolvedValueOnce(semFerramenta("pronto"));
    const r = await responder({ historico: [], pergunta: "x" });

    // O carimbo diz v1…
    expect(r.referencias.tipiVersaoId).toBe("tipi-v1");
    // …e as DUAS ferramentas leram as linhas da v1 — nenhuma consulta foi para a v2.
    const versoesLidas = mockPrisma.fiscalTipiLinha.findMany.mock.calls.map((c) => c[0]?.where?.versaoId);
    expect(versoesLidas.length).toBeGreaterThanOrEqual(2);
    expect(new Set(versoesLidas)).toEqual(new Set(["tipi-v1"]));
    // E a TIPI ATIVA foi lida UMA vez só, no começo da execução.
    expect(mockPrisma.fiscalTipiVersao.findFirst).toHaveBeenCalledTimes(1);
  });

  // ⚠⚠⚠ O ÚLTIMO ACHADO DO CODEX (24/09/2026): o prazo começava DENTRO do orquestrador, depois de
  // a rota já ter gastado tempo preparando. Agora ele vem de fora — e é ele que manda.
  it("usa o prazo que a ROTA passou, não um relógio próprio", async () => {
    rodada.mockResolvedValueOnce(semFerramenta("ok"));
    const ate = Date.now() + 30_000;
    await responder({ historico: [], pergunta: "x", ateMs: ate });
    expect(rodada.mock.calls[0][0].ateMs).toBe(ate);
  });

  it("sem margem para uma chamada, NÃO chama o modelo — e diz que nada foi cobrado", async () => {
    const r = await responder({ historico: [], pergunta: "x", ateMs: Date.now() + 4_000 });
    expect(rodada).not.toHaveBeenCalled();
    expect(r.rodadas).toBe(0);
    expect(r.custoMicros).toBe(0);
    expect(r.conteudo).toMatch(/demorou para preparar/);
  });

  // ⚠ O prazo é conferido antes de CADA rodada, não só da primeira: uma ferramenta lenta no meio
  // não pode levar a uma segunda chamada paga sem tempo de terminar.
  it("para antes da rodada seguinte quando a ferramenta comeu o prazo", async () => {
    const ate = Date.now() + 12_000;
    let relogio = null;
    rodada.mockImplementationOnce(async () => {
      // A primeira rodada "demora" até sobrar menos que o mínimo para chamar de novo.
      relogio = vi.spyOn(Date, "now").mockReturnValue(ate - 5_000);
      return comFerramenta("consultar_ncm", { ncm: "84379000" });
    });
    const r = await responder({ historico: [], pergunta: "x", ateMs: ate });
    // ⚠ Restaura SÓ o relógio: `vi.restoreAllMocks()` também apagaria o histórico do `rodada`, e a
    // asserção abaixo leria zero chamadas — foi exatamente o que aconteceu na primeira versão.
    relogio?.mockRestore();
    expect(rodada).toHaveBeenCalledTimes(1);
    expect(r.rodadas).toBe(1);
  });

  it("resposta vazia do modelo vira mensagem honesta, não string vazia", async () => {
    rodada.mockResolvedValueOnce(semFerramenta(""));
    const r = await responder({ historico: [], pergunta: "x" });
    expect(r.conteudo).toMatch(/Não consegui formular uma resposta/);
  });
});
