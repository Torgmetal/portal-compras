import { describe, it, expect } from "vitest";
import { linhaDaReceita, impostosDaObra } from "@/lib/fiscal/impostos-da-obra";

// Linha real de receita (OP de TMSA): CFOP nulo, NCM só no texto.
const REC = { id: "r1", descricao: "TP0051075 — ESTRUTURA METALICA TRELICA - [NCM: 84313900] - [ETC: TPR751-017]", cfop: null, valor: 1000,
  icmsPct: 12, ipiPct: 0, pisPct: 1.65, cofinsPct: 7.6, issPct: null, irrfPct: 3, csllPct: 1.08 };

describe("linhaDaReceita", () => {
  it("NCM vem do texto; CFOP ausente fica null (não se adivinha)", () => {
    expect(linhaDaReceita(REC)).toMatchObject({ ncm: "84313900", cfop: null, pct: { icms: 12, ipi: 0, pis: 1.65 } });
  });
  it("CFOP pontuado vira dígitos", () => {
    expect(linhaDaReceita({ ...REC, cfop: "6.118" }).cfop).toBe("6118");
  });
});

describe("impostosDaObra", () => {
  const base = { receita: linhaDaReceita(REC), valor: 1000,
    ipiRegra: { determinado: true, aliquota: 5 }, icmsRegra: { estado: "REFERENCIA", aliquota: 12 },
    ibsCbs: { situacao: "UNICA", linhas: [{ pCbs: 0.9, pIbsUf: 0.1, ultimaNf: "943" }] } };
  const por = (r) => Object.fromEntries(r.linhas.map((x) => [x.tributo, x]));

  it("⚠ IPI 0% cadastrado contra 5% da TIPI fica DIVERGENTE e o valor sai pela regra", () => {
    expect(por(impostosDaObra(base)).IPI).toMatchObject({ cadastrado: 0, regra: 5, divergente: true, valor: 50 });
  });
  it("PIS/COFINS usam o cadastrado; CBS/IBS a regra das NFs", () => {
    const l = por(impostosDaObra(base));
    expect(l.PIS).toMatchObject({ cadastrado: 1.65, regra: null, valor: 16.5, divergente: false });
    expect(l.CBS).toMatchObject({ regra: 0.9, valor: 9 });
    expect(l.IBS).toMatchObject({ regra: 0.1, valor: 1 });
    expect(l.CBS.nota).toMatch(/NF 943/);
  });
  it("⚠ IBS/CBS sem NF: sem valor e com nota — nunca 0%", () => {
    const l = por(impostosDaObra({ ...base, ibsCbs: { situacao: "SEM_NF", linhas: [] } })).CBS;
    expect(l).toMatchObject({ regra: null, valor: null });
    expect(l.nota).toMatch(/nenhuma NF/i);
  });
  it("⚠ IBS/CBS divergente: sem valor, com as duas alíquotas na nota", () => {
    const l = por(impostosDaObra({ ...base, ibsCbs: { situacao: "DIVERGENTE", linhas: [
      { pCbs: 0.9, pIbsUf: 0.1, ultimaNf: "1" }, { pCbs: 0.8, pIbsUf: 0.1, ultimaNf: "2" }] } })).CBS;
    expect(l.valor).toBeNull();
    expect(l.nota).toMatch(/0\.9.*0\.8|0,9.*0,8/);
  });
  it("obra sem receita: só a regra", () => {
    expect(por(impostosDaObra({ ...base, receita: null })).ICMS).toMatchObject({ cadastrado: null, regra: 12, valor: 120, divergente: false });
  });
  it("total soma só o que tem valor", () => {
    expect(impostosDaObra(base).total).toBe(120 + 50 + 16.5 + 76 + 30 + 10.8 + 9 + 1);
  });
});

import { ipiDaRegra } from "@/lib/fiscal/impostos-da-obra";

describe("ipiDaRegra (forma do ipiDaTipi → forma do simulador da obra)", () => {
  it("percentual vira aliquota", () => {
    expect(ipiDaRegra({ determinado: true, tipo: "PERCENTUAL", valor: 5 })).toMatchObject({ determinado: true, aliquota: 5 });
  });
  it("NT é 0% com a nota de não tributado", () => {
    expect(ipiDaRegra({ determinado: true, tipo: "NT", valor: null })).toMatchObject({ determinado: true, aliquota: 0, motivo: expect.stringMatching(/não tributado/i) });
  });
  it("⚠ Ex TIPI: mantém a alíquota geral, mas avisa", () => {
    expect(ipiDaRegra({ determinado: true, tipo: "PERCENTUAL", valor: 5, inconclusivo: true, temEx: true }).motivo).toMatch(/Ex TIPI/);
  });
  it("não determinado passa o motivo adiante", () => {
    expect(ipiDaRegra({ determinado: false, motivo: "sem NCM" })).toEqual({ determinado: false, aliquota: null, motivo: "sem NCM" });
  });
});
