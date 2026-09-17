// Um cron não pode atropelar a si mesmo.
//
// ⚠⚠ A PRIMEIRA TENTATIVA FOI `pg_try_advisory_lock` E ELA NÃO FUNCIONOU. Trava consultiva é de
// SESSÃO; o pooler do Neon e o pool do Prisma atendem dois `$queryRaw` em conexões diferentes,
// então a trava sai numa conexão e a conferência acontece em outra. Medido em 17/09/2026: duas
// chamadas simultâneas ao cron `omie-encerrados` rodaram AS DUAS, inteiras. Estes testes existem
// para que a substituição — arrendamento por UPDATE condicional — não seja desfeita por engano.
import { describe, it, expect, vi } from "vitest";
import { comTravaDeCron, TTL_PADRAO_MS } from "@/lib/cron-trava";

/** Um prisma de mentira que responde à instrução de tomar a vez. */
const fakePrisma = (pegouAVez) => ({
  $queryRaw: vi.fn(async () => (pegouAVez ? [{ job: "j" }] : [])),
  $executeRaw: vi.fn(async () => 1),
});

describe("comTravaDeCron", () => {
  it("com a vez livre, executa e devolve o resultado", async () => {
    const prisma = fakePrisma(true);
    const r = await comTravaDeCron(prisma, "j", async () => "feito");
    expect(r).toBe("feito");
  });

  it("⚠⚠ com a vez tomada, NÃO executa — e devolve null em vez de esperar na fila", async () => {
    const prisma = fakePrisma(false);
    const fn = vi.fn();
    const r = await comTravaDeCron(prisma, "j", fn);
    expect(r).toBeNull();
    expect(fn).not.toHaveBeenCalled();
    // ⚠ E não solta a vez de quem está com ela
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("solta a vez ao terminar", async () => {
    const prisma = fakePrisma(true);
    await comTravaDeCron(prisma, "j", async () => 1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("⚠⚠ solta a vez MESMO quando o trabalho explode", async () => {
    const prisma = fakePrisma(true);
    await expect(comTravaDeCron(prisma, "j", async () => { throw new Error("caiu"); })).rejects.toThrow("caiu");
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  // ⚠ Processo serverless morre sem aviso: se a Vercel cortar no maxDuration, ninguém roda o
  // `finally`. Sem prazo, a vez ficaria reservada para sempre e o cron nunca mais rodaria.
  it("⚠ o prazo tem folga para a execução mais longa, e não é eterno", async () => {
    expect(TTL_PADRAO_MS).toBeGreaterThanOrEqual(5 * 60_000);
    expect(TTL_PADRAO_MS).toBeLessThanOrEqual(30 * 60_000);
  });

  it("falha ao SOLTAR não vira erro do cron — o prazo devolve a vez sozinho", async () => {
    const prisma = {
      $queryRaw: async () => [{ job: "j" }],
      $executeRaw: () => Promise.reject(new Error("banco caiu na hora de soltar")),
    };
    await expect(comTravaDeCron(prisma, "j", async () => "ok")).resolves.toBe("ok");
  });
});
