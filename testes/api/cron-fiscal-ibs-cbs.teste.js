// Achado do Codex (28/09/2026): o cron SOMAVA as notas de ontem às regras gravadas, e a reconstrução
// já contava até hoje — no dia seguinte, as notas de ontem entravam duas vezes; rodar o cron de novo,
// três. O cron agora reconstrói (substitui), e repetir não muda a contagem.
import { beforeEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ aquecer: vi.fn(), registrar: vi.fn(), reconstruir: vi.fn() }));
vi.mock("@/lib/db-retry", () => ({ aquecerBanco: mocks.aquecer }));
vi.mock("@/lib/cron-monitor", () => ({ registrarExecucao: mocks.registrar }));
vi.mock("@/lib/cron-auth", () => ({ temCronSecret: () => true }));
vi.mock("@/lib/prisma", () => ({ prisma: {}, prismaDirect: { direto: true } }));
// ⚠ Só a reconstrução existe no módulo mockado: se o cron voltar a importar a gravação que soma,
// o import quebra aqui.
vi.mock("@/lib/fiscal/coleta-ibs-cbs", () => ({ reconstruirRegras: mocks.reconstruir }));

import { GET } from "@/app/api/cron/fiscal-ibs-cbs/route";

const rodar = () => GET(new Request("http://localhost/api/cron/fiscal-ibs-cbs"));

beforeEach(() => { vi.clearAllMocks(); mocks.reconstruir.mockResolvedValue({ notas: 484, regras: 84 }); });

describe("cron de IBS/CBS", () => {
  it("reconstrói pela conexão direta e registra no monitor", async () => {
    const r = await rodar();
    expect(r.status).toBe(200);
    expect(mocks.reconstruir).toHaveBeenCalledWith({ db: { direto: true } });
    expect(mocks.registrar).toHaveBeenCalledWith("fiscal-ibs-cbs", expect.objectContaining({ ok: true, mensagem: expect.stringMatching(/484/) }));
  });

  it("falha aparece no monitor com 500", async () => {
    mocks.reconstruir.mockRejectedValue(new Error("Omie ListarNF: HTTP 502."));
    const r = await rodar();
    expect(r.status).toBe(500);
    expect(mocks.registrar).toHaveBeenCalledWith("fiscal-ibs-cbs", expect.objectContaining({ ok: false, mensagem: expect.stringMatching(/502/) }));
  });
});
