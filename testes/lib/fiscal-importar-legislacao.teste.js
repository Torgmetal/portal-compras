import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── A COLETA DA LEGISLAÇÃO ──────────────────────────────────────────────────
//
// ⚠⚠ OS TRÊS CENÁRIOS AQUI SÃO ACHADOS DO CODEX (23/09/2026), e nenhum deles aparece numa rodada
// feliz: página reprovada que se REPETE, fonte que volta de B para um A já guardado, e lote
// cortado pelo limite de tempo da rota. Os três terminavam em "sucesso" no relatório.

vi.mock("server-only", () => ({}));
const banco = vi.hoisted(() => ({ versoes: new Map(), ativa: new Map(), transacoes: 0 }));

vi.mock("@/lib/prisma", () => {
  const tx = {
    fiscalNormaVersao: {
      updateMany: vi.fn(async ({ where }) => {
        if (banco.ativa.get(where.normaId)) banco.ativa.delete(where.normaId);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }) => {
        if (data.status === "ATIVA") banco.ativa.set("n1", where.id);
        banco.versoes.set(where.id, { ...banco.versoes.get(where.id), ...data });
        return banco.versoes.get(where.id);
      }),
      create: vi.fn(async ({ data }) => {
        const v = { id: `v${banco.versoes.size + 1}`, ...data };
        banco.versoes.set(v.id, v);
        if (data.status === "ATIVA") banco.ativa.set(data.normaId, v.id);
        return v;
      }),
    },
    fiscalDispositivo: { createMany: vi.fn(async () => ({ count: 1 })) },
  };
  return {
    prisma: {
      fiscalNorma: { upsert: vi.fn(async () => ({ id: "n1" })) },
      fiscalNormaVersao: {
        findUnique: vi.fn(async ({ where }) => {
          const achado = [...banco.versoes.values()].find((v) => v.sha256 === where.normaId_sha256.sha256);
          return achado ? { id: achado.id, status: banco.ativa.get("n1") === achado.id ? "ATIVA" : "SUPERADA" } : null;
        }),
        ...tx.fiscalNormaVersao,
      },
      fiscalDispositivo: tx.fiscalDispositivo,
      $transaction: vi.fn(async (fn) => { banco.transacoes += 1; return fn(tx); }),
    },
  };
});

const fonte = {
  chave: "RICMS-SP-art-402", tipo: "ARTIGO_RICMS", peso: "VINCULANTE", orgao: "x",
  titulo: "t", norma: "n", url: "https://exemplo/art402.aspx", artigos: ["402"],
};
vi.mock("@/lib/fiscal/fontes-legislacao", () => ({
  FONTES: [fonte, { ...fonte, chave: "OUTRA", url: "https://exemplo/outra.aspx" }],
  fontePorChave: (c) => (c === "OUTRA" ? { ...fonte, chave: "OUTRA", url: "https://exemplo/outra.aspx" } : (c === fonte.chave ? fonte : null)),
}));

const { importarNorma, importarLegislacao, baixarNorma } = await import("@/lib/fiscal/importar-legislacao");

const valido = (marca = "a") => `<p>Artigo 402 - Texto da lei ${marca}.</p><p>${"x".repeat(500)}</p>`;
const invalido = `<p>Artigo 402 - curto</p>`;
const responder = (html, atraso = 0) => vi.fn(() => new Promise((r) => setTimeout(() => r({ ok: true, status: 200, text: async () => html }), atraso)));

beforeEach(() => { banco.versoes.clear(); banco.ativa.clear(); banco.transacoes = 0; });
afterEach(() => vi.unstubAllGlobals());

describe("página reprovada que se repete", () => {
  // ⚠⚠ O DEFEITO: no primeiro dia a página entra como REPROVADA e aparece nas falhas; no segundo,
  // mesmo hash → "sem mudança" → contada como SUCESSO. O portal passaria a dizer que está tudo em
  // dia sobre uma norma que ele nunca conseguiu ler.
  it("continua contando como falha na segunda tentativa", async () => {
    vi.stubGlobal("fetch", responder(invalido));
    const a = await importarNorma(fonte.chave);
    expect(a.status).toBe("REPROVADA");
    const b = await importarNorma(fonte.chave);
    expect(b.status).toBe("REPROVADA");
    expect(b.mensagem).toMatch(/continua sem passar na conferência/i);
  });

  it("e nunca vira versão ATIVA", async () => {
    vi.stubGlobal("fetch", responder(invalido));
    await importarNorma(fonte.chave);
    expect(banco.ativa.size).toBe(0);
  });
});

describe("A → B → A: a fonte volta a um conteúdo já guardado", () => {
  // ⚠⚠ O DEFEITO: a promoção só acontecia no caminho de CRIAÇÃO de versão. Voltando para um hash
  // que o banco já tem, esse caminho não roda — e a versão ATIVA continuava sendo a intermediária,
  // com o portal citando o texto errado e dizendo "sem mudança".
  it("reativa a versão histórica em vez de deixar a intermediária ativa", async () => {
    vi.stubGlobal("fetch", responder(valido("A")));
    const a = await importarNorma(fonte.chave);
    expect(a.status).toBe("IMPORTADA");

    vi.stubGlobal("fetch", responder(valido("B")));
    const b = await importarNorma(fonte.chave);
    expect(b.status).toBe("IMPORTADA");
    expect(banco.ativa.get("n1")).toBe(b.versaoId);

    vi.stubGlobal("fetch", responder(valido("A")));
    const c = await importarNorma(fonte.chave);
    expect(c.status).toBe("REATIVADA");
    expect(c.versaoId).toBe(a.versaoId);
    expect(banco.ativa.get("n1")).toBe(a.versaoId);
  });

  // ⚠ A reativação é ATÔMICA: superar a outra e promover esta na mesma transação, senão o índice
  // parcial `uma_ativa` recusa o meio do caminho e a norma fica sem versão ativa nenhuma.
  it("superar e promover acontecem na mesma transação", async () => {
    vi.stubGlobal("fetch", responder(valido("A")));
    await importarNorma(fonte.chave);
    vi.stubGlobal("fetch", responder(valido("B")));
    await importarNorma(fonte.chave);
    const antes = banco.transacoes;
    vi.stubGlobal("fetch", responder(valido("A")));
    await importarNorma(fonte.chave);
    expect(banco.transacoes).toBe(antes + 1);
  });

  it("o mesmo conteúdo já ATIVO é sem mudança, sem transação nenhuma", async () => {
    vi.stubGlobal("fetch", responder(valido("A")));
    await importarNorma(fonte.chave);
    const antes = banco.transacoes;
    const r = await importarNorma(fonte.chave);
    expect(r.status).toBe("SEM_MUDANCA");
    expect(banco.transacoes).toBe(antes);
  });
});

describe("o orçamento de tempo da rota", () => {
  // ⚠⚠ O DEFEITO: 10 fontes, timeout de 30 s cada, rota de 60 s. Dois downloads lentos estouravam
  // o orçamento e a Vercel matava a execução no meio do lote — devolvendo "5 importadas, 0 falhas",
  // indistinguível de uma rodada completa, com as 5 últimas envelhecendo em silêncio.
  it("fonte não consultada é dita por NOME, não omitida", async () => {
    vi.stubGlobal("fetch", responder(valido()));
    const r = await importarLegislacao({ pausaMs: 0, ateMs: Date.now() - 1 });
    expect(r.processadas).toBe(0);
    expect(r.naoProcessadas).toEqual(["RICMS-SP-art-402", "OUTRA"]);
    expect(r.total).toBe(2);
  });

  it("o que coube é processado, e o resto é listado", async () => {
    vi.stubGlobal("fetch", responder(valido()));
    const r = await importarLegislacao({ pausaMs: 0 });
    expect(r.processadas).toBe(2);
    expect(r.naoProcessadas).toEqual([]);
  });

  // ⚠ O timeout do download ENCOLHE para o tempo restante — pedir 30 s com 2 s de orçamento é
  // deixar a rota morrer em vez de responder.
  it("sem tempo restante, o download nem é tentado", async () => {
    const f = responder(valido());
    vi.stubGlobal("fetch", f);
    const r = await baixarNorma(fonte, { ateMs: Date.now() + 500 });
    expect(r.erro).toMatch(/Sem tempo no orçamento/);
    expect(f).not.toHaveBeenCalled();
  });

  // ⚠ A pausa entre fontes também respeita o orçamento: dormir 800 ms no fim da janela é gastar a
  // última fonte para não fazer nada.
  it("a pausa não come a janela restante", async () => {
    vi.stubGlobal("fetch", responder(valido()));
    const t0 = Date.now();
    await importarLegislacao({ pausaMs: 5000, ateMs: t0 + 2500 });
    expect(Date.now() - t0).toBeLessThan(2500);
  });
});
