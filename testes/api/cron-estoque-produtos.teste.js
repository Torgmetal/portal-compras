// O cron `estoque-produtos` com a sincronização DE VERDADE — só o Omie, o banco e o monitor são de
// mentira.
//
// ⚠⚠ O QUE SE TRAVA AQUI É QUE A FALHA CHEGA AO MONITOR. Até 25/09/2026 a sincronização engolia o erro
// do Omie (`catch { break; }`) e o cron batia o ponto verde de hora em hora, com a Qtd só do
// Almoxarifado e, quando uma página falhava, zerando quem não tinha sido lido.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
import { RESPOSTA_LOCAIS, LINHAS, paginaPosicao } from "@/testes/fixtures/omie-posicao-estoque";

const mocks = vi.hoisted(() => ({ omieCall: vi.fn(), aquecer: vi.fn(), registrar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/omie-call", () => ({ omieCall: mocks.omieCall, ORCAMENTO_ESGOTADO: "Orçamento de tempo esgotado" }));
vi.mock("@/lib/db-retry", () => ({ aquecerBanco: mocks.aquecer, ehErroConexao: () => true }));
vi.mock("@/lib/cron-monitor", () => ({ registrarExecucao: mocks.registrar }));
vi.mock("@/lib/cron-auth", () => ({ temCronSecret: () => true }));

import { GET, maxDuration } from "@/app/api/cron/estoque-produtos/route";

const req = () => new Request("http://localhost/api/cron/estoque-produtos");

/** O Omie de mentira: catálogo vazio de novidade, os seis locais e a posição pedida. */
function omie(paginas) {
  mocks.omieCall.mockImplementation(async (_url, call, param) => {
    if (call === "ListarProdutos") {
      return { pagina: 1, total_de_paginas: 1, registros: 1, total_de_registros: 1,
        produto_servico_cadastro: [{ codigo: "301000045", codigo_produto: 1, codigo_produto_integracao: "",
          descricao: "BARRA CHATA", unidade: "KG", codigo_familia: 1, descricao_familia: "MATERIA PRIMA", inativo: "N" }] };
    }
    if (call === "ListarLocaisEstoque") return RESPOSTA_LOCAIS;
    if (call === "ListarPosEstoque") {
      const p = paginas[param.nPagina - 1];
      if (p instanceof Error) throw p;
      return p;
    }
    throw new Error(`chamada inesperada ao Omie: ${call}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.aquecer.mockResolvedValue(undefined);
  mocks.registrar.mockResolvedValue(undefined);
  mockPrisma.configEstoque.findFirst.mockResolvedValue({ id: "cfg" });
  mockPrisma.configEstoque.update.mockResolvedValue({});
  mockPrisma.estoqueItem.findMany.mockResolvedValue([{ codigoOmie: "301000045", qtdAtual: 320, locaisQtd: {} }]);
  mockPrisma.estoqueItem.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
});

afterEach(() => vi.useRealTimers());

describe("cron estoque-produtos — a falha do Omie aparece", () => {
  // ⚠⚠ Quebra que pega: qualquer volta do `catch { break; }` — o cron diria `ok: true`.
  it("⚠⚠ página da posição que falha: 500 e `ok: false` no monitor, com o motivo", async () => {
    omie([
      paginaPosicao(LINHAS.barra, { nPagina: 1, nTotPaginas: 2, nTotRegistros: 2 }),
      new Error("SOAP-ERROR: Broken response from Application Server"),
    ]);

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect(mocks.registrar).toHaveBeenCalledTimes(1);
    const [job, execucao] = mocks.registrar.mock.calls[0];
    expect(job).toBe("estoque-produtos");
    expect(execucao.ok).toBe(false);
    expect(execucao.mensagem).toMatch(/Broken response/);
  });

  it("posição inteira: 200 e `ok: true`", async () => {
    omie([paginaPosicao(LINHAS.barra)]);

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(mocks.registrar.mock.calls[0][1].ok).toBe(true);
  });
});

describe("cron estoque-produtos — o prazo cabe no maxDuration", () => {
  // ⚠⚠ Morta por timeout da Vercel, a função não chega ao `catch` e o monitor fica sem registro — a
  // falha voltaria a ser invisível. Quebra que pega: o prazo contado a partir de DEPOIS de acordar o
  // banco (o padrão da função), que num início a frio empurra a leitura para além dos 60 s.
  it("⚠⚠ conta do início da requisição: acordar o banco devagar não empurra o prazo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-09-25T12:00:00Z").getTime();
    vi.setSystemTime(t0);
    mocks.aquecer.mockImplementation(async () => { vi.setSystemTime(Date.now() + 10_000); }); // Neon acordando
    omie([paginaPosicao(LINHAS.barra)]);

    await GET(req());

    const [, , , opcoes] = mocks.omieCall.mock.calls.find(([, call]) => call === "ListarPosEstoque");
    expect(opcoes.ateMs).toBeGreaterThan(t0);
    // 15 s de folga para gravar os ~650 itens e bater o ponto do monitor
    expect(opcoes.ateMs).toBeLessThanOrEqual(t0 + (maxDuration - 15) * 1000);
  });
});
