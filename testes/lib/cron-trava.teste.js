// Um cron não pode atropelar a si mesmo.
//
// ⚠⚠ A PRIMEIRA TENTATIVA FOI `pg_try_advisory_lock` E ELA NÃO FUNCIONOU. Trava consultiva é de
// SESSÃO; o pooler do Neon e o pool do Prisma atendem dois `$queryRaw` em conexões diferentes,
// então a trava sai numa conexão e a conferência acontece em outra. Medido em 17/09/2026: duas
// chamadas simultâneas ao cron `omie-encerrados` rodaram AS DUAS, inteiras. Estes testes existem
// para que a substituição — arrendamento por UPDATE condicional — não seja desfeita por engano.
import { describe, it, expect, vi } from "vitest";
import { comTravaDeCron, reservarVez, renovarVez, TTL_PADRAO_MS } from "@/lib/cron-trava";

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

// ─── O RELÓGIO É UM SÓ, E É O DO POSTGRES ────────────────────────────────────
//
// ⚠⚠ MEDIDO EM 17/09/2026: a máquina de dev (WSL) estava **241 segundos à frente** do Neon. A
// versão anterior mandava `new Date(Date.now() + ttl)` como parâmetro e o Postgres o comparava com
// o `now()` DELE. A vez de 2 minutos virava uma de 6 para o banco, e o app — subtraindo do próprio
// relógio — anunciava "falta 1 segundo" onde o banco ainda guardava 137, mandando clicar de novo
// numa vez que não estava livre. Na Vercel os relógios andam juntos, mas trava que depende disso é
// trava que falha no dia em que não andarem.
describe("o prazo é calculado dentro do SQL", () => {
  it("⚠⚠ manda SEGUNDOS, nunca um Date montado em JS", async () => {
    const prisma = fakePrisma(true);
    await reservarVez(prisma, "j", 120_000);
    const [textos, ...valores] = prisma.$queryRaw.mock.calls[0];
    expect(textos.join("")).toMatch(/now\(\) \+ .*interval '1 second'/);
    expect(valores).toContain(120);
    expect(valores.some((v) => v instanceof Date)).toBe(false);
  });

  it("o mesmo vale para renovar a vez", async () => {
    const prisma = fakePrisma(true);
    await renovarVez(prisma, "j", 120_000);
    const [textos, ...valores] = prisma.$executeRaw.mock.calls[0];
    expect(textos.join("")).toMatch(/now\(\)/);
    expect(valores.some((v) => v instanceof Date)).toBe(false);
  });

  it("⚠ quem foi barrado recebe os segundos que o PRÓPRIO banco contou", async () => {
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([])            // a vez está tomada
        .mockResolvedValueOnce([{ faltam: 47 }]), // e o banco diz quanto falta
      $executeRaw: vi.fn(async () => 1),
    };
    expect(await reservarVez(prisma, "j", 120_000)).toEqual({ ok: false, faltamSegundos: 47 });
  });

  it("falhar ao ler quanto falta não vira sucesso — só perde o número", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("sem banco")),
      $executeRaw: vi.fn(async () => 1),
    };
    expect(await reservarVez(prisma, "j", 120_000)).toEqual({ ok: false, faltamSegundos: null });
  });

  // ⚠ Renovar é para quem JÁ está com a vez: sem `WHERE` de prazo, de propósito. Com ele, uma
  // renovação que chegasse um milissegundo depois do vencimento deixaria o trabalho seguir sem vez.
  it("⚠ renovar não tem condição de prazo — quem chama está com a vez na mão", async () => {
    const prisma = fakePrisma(true);
    await renovarVez(prisma, "j", 1000);
    expect(prisma.$executeRaw.mock.calls[0][0].join("")).not.toMatch(/travadoAte" <|IS NULL/);
  });
});
