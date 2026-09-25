// O cron do data book faz duas coisas: vincula os certificados que chegaram depois (o clique no
// "Puxar certificados" que ninguém lembrou de dar — OP-102, 25/09/2026) e termina as gerações de
// volume abandonadas. Uma não pode derrubar a outra, e falha em qualquer uma tem de aparecer no monitor.
import { beforeEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aquecer: vi.fn(), registrar: vi.fn(), vincular: vi.fn(), processar: vi.fn(), proximoJob: vi.fn(),
}));
vi.mock("@/lib/db-retry", () => ({ aquecerBanco: mocks.aquecer, ehErroConexao: () => true }));
vi.mock("@/lib/cron-monitor", () => ({ registrarExecucao: mocks.registrar }));
vi.mock("@/lib/cron-auth", () => ({ temCronSecret: () => true }));
vi.mock("@/lib/databook-volumes", () => ({ processarGeracao: mocks.processar }));
vi.mock("@/lib/databook-certificados-novos", () => ({ vincularCertificadosNovos: mocks.vincular }));
vi.mock("@/lib/prisma", () => ({ prisma: { dataBookGeracao: { findFirst: mocks.proximoJob, update: vi.fn() } } }));

import { GET } from "@/app/api/cron/data-book/route";

const rodar = () => GET(new Request("http://localhost/api/cron/data-book"));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.aquecer.mockResolvedValue(undefined);
  mocks.proximoJob.mockResolvedValue(null);
  mocks.vincular.mockResolvedValue({ vinculados: 11, livros: [{ id: "book102", opNumero: "102", secoes: [{ numero: "04", rs: ["261646"] }] }] });
});

describe("cron do data book", () => {
  it("vincula os certificados novos e diz quantos, antes de cuidar das gerações", async () => {
    const ordem = [];
    mocks.vincular.mockImplementation(async () => { ordem.push("certificados"); return { vinculados: 11, livros: [] }; });
    mocks.proximoJob.mockImplementation(async () => { ordem.push("volumes"); return null; });
    const r = await rodar();
    expect(r.status).toBe(200);
    expect(ordem).toEqual(["certificados", "volumes"]);
    expect((await r.json()).certificados).toMatchObject({ vinculados: 11 });
    expect(mocks.registrar).toHaveBeenCalledWith("data-book", expect.objectContaining({ ok: true }));
  });

  it("vínculo que falha não impede de terminar as gerações — e aparece no monitor", async () => {
    mocks.vincular.mockRejectedValue(new Error("P2028 Transaction already closed"));
    const r = await rodar();
    expect(mocks.proximoJob).toHaveBeenCalled();
    const [job, dados] = mocks.registrar.mock.calls[0];
    expect(job).toBe("data-book");
    expect(dados.ok).toBe(false);
    expect(dados.mensagem).toMatch(/certificados.*P2028/);
    expect((await r.json()).certificados).toMatchObject({ erro: expect.stringContaining("P2028") });
  });

  it("⚠⚠ aquecimento que FALHA ainda registra a execução como falha (achado do Codex, 17/09/2026)", async () => {
    mocks.aquecer.mockRejectedValue(new Error("P1001 Can't reach database server"));
    const r = await rodar();
    expect(r.status).toBe(500);
    expect(mocks.vincular).not.toHaveBeenCalled();
    expect(mocks.registrar).toHaveBeenCalledTimes(1);
    const [, dados] = mocks.registrar.mock.calls[0];
    expect(dados.ok).toBe(false);
    expect(dados.mensagem).toContain("P1001");
  });
});
