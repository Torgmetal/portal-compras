// O aquecimento do banco tem de estar DENTRO do bloco que registra a execução.
//
// ⚠⚠ ACHADO DO CODEX (17/09/2026), e era uma inversão perfeita: `aquecerBanco` LANÇA quando esgota
// as tentativas. Fora do `try`, a falha escapava sem passar pelo `registrarExecucao` — ou seja, o
// cenário que o aquecimento existe para sobreviver (a compute do Neon dormindo) era justamente o
// que apagaria o cron do monitor. Heartbeat congelado em `ok: true` foi o que deixou o
// `cmr-reconciliar` 55h parado sem ninguém saber.
//
// ⚠ O outro teste (`testes/cron-agenda.teste.js`) confere que TODO cron agendado MENCIONA
// `aquecerBanco` — é inventário, e o próprio Codex apontou que inventário não prova execução. Este
// aqui roda o handler de verdade e prova a ORDEM. Um por padrão, não os 24: o que se está travando
// é a forma, e ela é a mesma em todos.
import { beforeEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aquecer: vi.fn(), registrar: vi.fn(), reconciliar: vi.fn(), cronSecret: vi.fn(() => true),
}));
vi.mock("@/lib/db-retry", () => ({ aquecerBanco: mocks.aquecer, ehErroConexao: () => true }));
vi.mock("@/lib/cron-monitor", () => ({ registrarExecucao: mocks.registrar }));
vi.mock("@/lib/omie-encerramento", () => ({ reconciliarEncerramentos: mocks.reconciliar }));
vi.mock("@/lib/cron-auth", () => ({ temCronSecret: mocks.cronSecret }));
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { create: vi.fn(async () => ({})) } } }));

import { GET } from "@/app/api/cron/omie-encerrados/route";

const req = () => new Request("http://localhost/api/cron/omie-encerrados");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cronSecret.mockReturnValue(true);
  mocks.aquecer.mockResolvedValue(undefined);
  mocks.reconciliar.mockResolvedValue({ total: 1, marcados: 0, desmarcados: 0, indefinidos: 0, completa: true, motivo: null });
});

describe("cron acorda o banco antes de trabalhar", () => {
  it("o aquecimento vem ANTES do trabalho", async () => {
    const ordem = [];
    mocks.aquecer.mockImplementation(async () => { ordem.push("aquecer"); });
    mocks.reconciliar.mockImplementation(async () => { ordem.push("trabalho"); return { total: 0, marcados: 0, desmarcados: 0, indefinidos: 0, completa: true }; });
    await GET(req());
    expect(ordem).toEqual(["aquecer", "trabalho"]);
  });

  it("⚠⚠ aquecimento que FALHA ainda registra a execução como falha", async () => {
    mocks.aquecer.mockRejectedValue(new Error("P1001 Can't reach database server"));
    const r = await GET(req());
    expect(r.status).toBe(500);
    expect(mocks.reconciliar).not.toHaveBeenCalled();
    // ⚠ É ESTA a asserção que importa: sem ela o cron some do monitor exatamente quando quebra.
    expect(mocks.registrar).toHaveBeenCalledTimes(1);
    const [job, dados] = mocks.registrar.mock.calls[0];
    expect(job).toBe("omie-encerrados");
    expect(dados.ok).toBe(false);
    expect(dados.mensagem).toContain("P1001");
  });

  it("execução boa registra sucesso, com o resumo do que fez", async () => {
    mocks.reconciliar.mockResolvedValue({ total: 274, marcados: 3, desmarcados: 1, indefinidos: 0, completa: true, motivo: null });
    const r = await GET(req());
    expect(r.status).toBe(200);
    const [, dados] = mocks.registrar.mock.calls[0];
    expect(dados.ok).toBe(true);
    expect(dados.mensagem).toContain("3 encerrado");
  });

  // ⚠ Coleta incompleta é sucesso COM aviso: a rodada aconteceu, mas nada foi desmarcado. Sem o
  // aviso no heartbeat, um retrato pela metade viraria "rodou, tudo certo".
  it("coleta incompleta avisa no heartbeat em vez de passar batido", async () => {
    mocks.reconciliar.mockResolvedValue({ total: 274, marcados: 0, desmarcados: 0, indefinidos: 2, completa: false, motivo: "página 3 falhou" });
    await GET(req());
    const [, dados] = mocks.registrar.mock.calls[0];
    expect(dados.mensagem).toContain("coleta incompleta");
    expect(dados.mensagem).toContain("2 sem confirmação");
  });

  it("sem o segredo do cron, em produção, não roda nem registra", async () => {
    mocks.cronSecret.mockReturnValue(false);
    const antes = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    const r = await GET(req());
    expect(r.status).toBe(401);
    expect(mocks.aquecer).not.toHaveBeenCalled();
    expect(mocks.registrar).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", antes);
  });
});
