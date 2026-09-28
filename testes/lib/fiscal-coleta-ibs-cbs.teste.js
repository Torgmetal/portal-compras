import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { coletarRegrasIbsCbs, regraIbsCbs } from "@/lib/fiscal/coleta-ibs-cbs";

const pag = (total, nfs) => ({ total_de_paginas: total, nfCadastro: nfs });
const nf = (nNF) => ({ ide: { nNF, dEmi: "01/09/2026" }, det: [{ prod: { NCM: "9406.90.20", CFOP: "6.101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 } }] });

describe("coletarRegrasIbsCbs", () => {
  it("percorre as páginas e agrupa", async () => {
    const listar = vi.fn(async (p) => (p.pagina === 1 ? pag(2, [nf("1")]) : pag(2, [nf("2")])));
    const r = await coletarRegrasIbsCbs({ de: "01/09/2026", ate: "25/09/2026", listar });
    expect(r.notas).toBe(2);
    expect(r.regras).toEqual([expect.objectContaining({ ncm: "94069020", cfop: "6101", qtdNotas: 2 })]);
    expect(listar).toHaveBeenCalledWith(expect.objectContaining({ dEmiInicial: "01/09/2026", dEmiFinal: "25/09/2026", tpNF: 1 }));
  });

  it("⚠ página que falha derruba a coleta — nada parcial", async () => {
    const listar = vi.fn(async (p) => (p.pagina === 1 ? pag(2, [nf("1")]) : { faultstring: "Erro interno" }));
    await expect(coletarRegrasIbsCbs({ de: "01/09/2026", ate: "25/09/2026", listar })).rejects.toThrow(/Erro interno/);
  });

  it("janela sem nota é zero, não erro", async () => {
    const listar = vi.fn(async () => ({ faultstring: "Não existem registros para a página [1]!" }));
    expect(await coletarRegrasIbsCbs({ de: "01/01/2026", ate: "02/01/2026", listar })).toEqual({ notas: 0, regras: [] });
  });
});

describe("regraIbsCbs", () => {
  it("normaliza a pontuação antes de consultar", async () => {
    const db = { fiscalRegraIbsCbs: { findMany: vi.fn(async () => [{ pCbs: 0.9, pIbsUf: 0.1 }]) } };
    const r = await regraIbsCbs({ ncm: "9406.90.20", cfop: "6.101" }, db);
    expect(db.fiscalRegraIbsCbs.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ncm: "94069020", cfop: "6101" } }));
    expect(r.situacao).toBe("UNICA");
  });
  it("NCM/CFOP incompletos: SEM_NF sem ir ao banco", async () => {
    const db = { fiscalRegraIbsCbs: { findMany: vi.fn() } };
    expect((await regraIbsCbs({ ncm: "8431", cfop: "" }, db)).situacao).toBe("SEM_NF");
    expect(db.fiscalRegraIbsCbs.findMany).not.toHaveBeenCalled();
  });
});

import { reconstruirRegras } from "@/lib/fiscal/coleta-ibs-cbs";

describe("reconstruirRegras", () => {
  it("junta os meses numa linha só, com a soma das notas, e troca a tabela numa transação", async () => {
    const listar = vi.fn(async (p) => (p.dEmiInicial.startsWith("01/01") ? pag(1, [nf("1")]) : pag(1, [nf("2"), nf("3")])));
    const db = { $executeRawUnsafe: vi.fn(async () => 1), $transaction: vi.fn(async (ops) => Promise.all(ops)) };
    const r = await reconstruirRegras({ hoje: new Date(2026, 1, 10), db, listar });
    expect(r).toEqual({ notas: 3, regras: 1 });
    expect(db.$executeRawUnsafe.mock.calls[0][0]).toMatch(/DELETE FROM "FiscalRegraIbsCbs"/);
    expect(db.$executeRawUnsafe.mock.calls[1][5]).toBe('{"3"}'); // qtdNotas = 1 + 2
    expect(listar).toHaveBeenCalledWith(expect.objectContaining({ dEmiInicial: "01/02/2026", dEmiFinal: "10/02/2026" }));
  });
  it("⚠ mês que falha não apaga nada", async () => {
    const listar = vi.fn(async (p) => (p.dEmiInicial.startsWith("01/01") ? pag(1, [nf("1")]) : { faultstring: "Erro interno" }));
    const db = { $executeRawUnsafe: vi.fn(), $transaction: vi.fn() };
    await expect(reconstruirRegras({ hoje: new Date(2026, 1, 10), db, listar })).rejects.toThrow(/Erro interno/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

// ⚠ Achado do Codex (28/09/2026): falha HTTP e JSON quebrado viravam `{}`, e `{}` passava por
// "coleta vazia" — a reconstrução apagava a tabela e gravava o nada.
describe("resposta que não é uma lista de notas é FALHA, nunca zero", () => {
  it.each([
    ["objeto vazio", {}],
    ["sem nfCadastro", { total_de_paginas: 1 }],
    ["nfCadastro que não é lista", { total_de_paginas: 1, nfCadastro: "x" }],
  ])("%s derruba a coleta", async (_, resp) => {
    await expect(coletarRegrasIbsCbs({ de: "01/09/2026", ate: "25/09/2026", listar: async () => resp }))
      .rejects.toThrow(/inesperada/);
  });

  it("⚠ e a reconstrução não apaga nada", async () => {
    const db = { $executeRawUnsafe: vi.fn(), $transaction: vi.fn() };
    await expect(reconstruirRegras({ hoje: new Date(2026, 1, 10), db, listar: async () => ({}) })).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  describe("o cliente do Omie (fetch de verdade, mockado)", () => {
    const antes = { ...process.env };
    beforeEach(() => { process.env.OMIE_APP_KEY = "k"; process.env.OMIE_APP_SECRET = "s"; });
    afterEach(() => { process.env = { ...antes }; vi.unstubAllGlobals(); });

    it("HTTP 502 com HTML é erro, com o status na mensagem", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 })));
      await expect(coletarRegrasIbsCbs({ de: "01/09/2026", ate: "25/09/2026" })).rejects.toThrow(/502/);
    });

    it("HTTP 200 com corpo que não é JSON é erro", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>manutenção</html>", { status: 200 })));
      await expect(coletarRegrasIbsCbs({ de: "01/09/2026", ate: "25/09/2026" })).rejects.toThrow(/JSON/);
    });

    it("⚠ o 'não existem registros' do Omie vem com HTTP 500 — continua sendo zero", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ faultstring: "ERROR: Não existem registros para a página [1]!" }), { status: 500 })));
      expect(await coletarRegrasIbsCbs({ de: "01/01/2026", ate: "02/01/2026" })).toEqual({ notas: 0, regras: [] });
    });
  });
});

describe("⚠ repetir a reconstrução não muda a contagem", () => {
  it("duas rodadas seguidas: cada uma apaga antes e grava a mesma soma", async () => {
    const listar = vi.fn(async (p) => (p.dEmiInicial.startsWith("01/01") ? pag(1, [nf("1")]) : pag(1, [nf("2"), nf("3")])));
    const db = { $executeRawUnsafe: vi.fn(async () => 1), $transaction: vi.fn(async (ops) => Promise.all(ops)) };
    await reconstruirRegras({ hoje: new Date(2026, 1, 10), db, listar });
    await reconstruirRegras({ hoje: new Date(2026, 1, 10), db, listar });
    const chamadas = db.$executeRawUnsafe.mock.calls;
    expect(chamadas.map((c) => /DELETE/.test(c[0]))).toEqual([true, false, true, false]);
    expect([chamadas[1][5], chamadas[3][5]]).toEqual(['{"3"}', '{"3"}']);
  });

  it("a gravação que somava não existe mais", async () => {
    expect(await import("@/lib/fiscal/coleta-ibs-cbs")).not.toHaveProperty("gravarRegras");
  });
});

// Achado do Codex (28/09/2026, rodada 2): `total_de_paginas || 1` fazia uma resposta sem paginação
// valer como "só uma página" — a coleta parava cedo e a reconstrução gravava metade do ano.
describe("⚠ paginação ausente ou inválida é FALHA, nunca 'uma página só'", () => {
  it.each([
    ["sem total_de_paginas", { nfCadastro: [nf("1")] }],
    ["total zero", { total_de_paginas: 0, nfCadastro: [nf("1")] }],
    ["total texto", { total_de_paginas: "3", nfCadastro: [nf("1")] }],
    ["total fracionário", { total_de_paginas: 1.5, nfCadastro: [nf("1")] }],
  ])("%s derruba a coleta", async (_, resp) => {
    await expect(coletarRegrasIbsCbs({ de: "01/09/2026", ate: "25/09/2026", listar: async () => resp }))
      .rejects.toThrow(/pagina/i);
  });

  it("o total que muda no meio da coleta também derruba", async () => {
    const listar = async (p) => (p.pagina === 1 ? pag(3, [nf("1")]) : pag(2, [nf("2")]));
    await expect(coletarRegrasIbsCbs({ de: "01/09/2026", ate: "25/09/2026", listar })).rejects.toThrow(/pagina/i);
  });

  it("e a reconstrução não abre a transação", async () => {
    const db = { $executeRawUnsafe: vi.fn(), $transaction: vi.fn() };
    await expect(reconstruirRegras({ hoje: new Date(2026, 1, 10), db, listar: async () => ({ nfCadastro: [nf("1")] }) })).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
