// A ROTA do cron de movimentações de estoque, com a sincronização mockada.
//
// ⚠⚠ O QUE ESTE ARQUIVO EXISTE PARA PEGAR (24/09/2026): a sincronização chamava um método que não
// existe no Omie e devolvia "0 movimentos" — e a rota batia o heartbeat como SUCESSO, hora após
// hora, com `EstoqueMovimentacao` vazia. O monitor nunca soube. Aqui se prova o outro lado do
// contrato: quando a sincronização lança, o monitor recebe `ok: false` com o motivo; e o prazo que
// a rota passa cabe no `maxDuration`, senão a Vercel mata a função antes do `catch`.
import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ sync: vi.fn(), registrar: vi.fn(), aquecer: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/cron-auth", () => ({ temCronSecret: vi.fn(() => true) }));
vi.mock("@/lib/db-retry", () => ({ aquecerBanco: mocks.aquecer }));
vi.mock("@/lib/cron-monitor", () => ({ registrarExecucao: mocks.registrar }));
// ⚠ Só a sincronização é falsa; o texto do heartbeat sai da função de verdade.
vi.mock("@/lib/omie-estoque-movimentos", async (original) => ({
  ...(await original()), sincronizarMovimentacoes: mocks.sync,
}));

import { GET, maxDuration } from "@/app/api/cron/estoque-movimentacoes/route";

const req = () => new Request("http://localhost/api/cron/estoque-movimentacoes");
const heartbeat = () => mocks.registrar.mock.calls.at(-1);

const RESUMO = {
  entradas: 3, saidas: 1, total: 4, lidos: 9, jaExistiam: 5, semQuantidade: 0,
  naoGravados: 0, falhasAlocacao: 0, paginas: 1,
  janela: { dDtInicial: "22/09/2026", dDtFinal: "24/09/2026" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.aquecer.mockResolvedValue(undefined);
  mocks.sync.mockResolvedValue(RESUMO);
});

describe("cron estoque-movimentacoes — a falha chega ao monitor", () => {
  it("⚠⚠ erro do Omie vira ok:false no monitor, não sucesso com zero", async () => {
    mocks.sync.mockRejectedValue(new Error(
      'Omie falhou na página 1: Method "ListarMovimentoEstoque" not exists — 0 movimento(s) gravado(s) nesta rodada'));
    const r = await GET(req());
    expect(r.status).toBe(500);
    expect(mocks.registrar).toHaveBeenCalledTimes(1);
    const [job, dados] = heartbeat();
    expect(job).toBe("estoque-movimentacoes");
    expect(dados.ok).toBe(false);
    expect(dados.mensagem).toContain("not exists");
  });

  it("movimento que não pôde ser gravado também é falha, e a resposta diz o que entrou", async () => {
    const erro = new Error("1 movimento(s) do Omie NÃO gravado(s): produto 999 sem código no portal");
    erro.resumo = { ...RESUMO, naoGravados: 1 };
    mocks.sync.mockRejectedValue(erro);
    const r = await GET(req());
    const json = await r.json();
    expect(r.status).toBe(500);
    expect(json.resumo).toMatchObject({ entradas: 3, naoGravados: 1 });
    expect(heartbeat()[1]).toMatchObject({ ok: false, mensagem: expect.stringContaining("NÃO gravado") });
  });

  it("sucesso registra o que foi feito, não só 'ok'", async () => {
    const r = await GET(req());
    expect(r.status).toBe(200);
    const [, dados] = heartbeat();
    expect(dados.ok).toBe(true);
    expect(dados.mensagem).toContain("4 novo(s)");
    expect(dados.mensagem).toContain("3 entrada(s), 1 saída(s)");
    expect(dados.mensagem).toContain("22/09/2026 a 24/09/2026");
  });

  it("janela de 2 dias, com prazo que cabe no maxDuration e deixa tempo para o heartbeat", async () => {
    const antes = Date.now();
    await GET(req());
    const [dias, { ateMs, abaterReservas }] = mocks.sync.mock.calls[0];
    expect(dias).toBe(2);
    // ⚠⚠ decisão do Vitor (26/09/2026): o cron grava as saídas SEM abater reserva de OP
    expect(abaterReservas).toBeFalsy();
    expect(ateMs).toBeGreaterThan(antes);
    // ⚠ folga de pelo menos 10 s: o `registrarExecucao` retenta ~9 s quando o Neon soluça
    expect(ateMs - antes).toBeLessThanOrEqual(maxDuration * 1000 - 10_000);
  });

  it("banco que não acorda também chega ao monitor (o aquecimento está dentro do try)", async () => {
    mocks.aquecer.mockRejectedValue(new Error("P1001 Can't reach database server"));
    const r = await GET(req());
    expect(r.status).toBe(500);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(heartbeat()[1]).toMatchObject({ ok: false, mensagem: expect.stringContaining("P1001") });
  });
});
