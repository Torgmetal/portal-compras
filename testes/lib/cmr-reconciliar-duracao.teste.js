import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/cron-auth", () => ({ temCronSecret: () => true }));
vi.mock("@/lib/prisma", () => ({ prisma: {}, prismaDirect: {} }));
vi.mock("@/lib/cron-monitor", () => ({ registrarExecucao: vi.fn() }));
vi.mock("@/lib/db-retry", () => ({ aquecerBanco: vi.fn() }));
vi.mock("@/lib/cmr-reconciliar", () => ({ reconciliarCmr: vi.fn() }));

// ⚠⚠ Com 60 s a Vercel matava a reconciliação antes do `registrarExecucao` (26/09/2026): a rodada das
// 02h40 não deixou nem sucesso nem erro. A sincronização do mesmo arquivo de ~17 MB já leva 62 s.
describe("cron cmr-reconciliar", () => {
  it("tem o mesmo teto de tempo da sincronização do CMR", async () => {
    const reconciliar = await import("@/app/api/cron/cmr-reconciliar/route");
    const sincronizar = await import("@/app/api/qualidade/cmr/sincronizar/route");
    expect(reconciliar.maxDuration).toBeGreaterThanOrEqual(300);
    expect(reconciliar.maxDuration).toBeGreaterThanOrEqual(sincronizar.maxDuration);
  });
});
