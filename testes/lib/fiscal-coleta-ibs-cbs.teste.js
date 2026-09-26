import { describe, it, expect, vi } from "vitest";
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
