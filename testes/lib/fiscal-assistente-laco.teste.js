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

  it("resposta vazia do modelo vira mensagem honesta, não string vazia", async () => {
    rodada.mockResolvedValueOnce(semFerramenta(""));
    const r = await responder({ historico: [], pergunta: "x" });
    expect(r.conteudo).toMatch(/Não consegui formular uma resposta/);
  });
});
