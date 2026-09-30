import { describe, it, expect } from "vitest";
import { arquivosPendentes, RX_GRD } from "@/lib/grd-engenharia-sync";

// Vitor (30/09/2026): "as GRDs do planejamento e da Engenharia não estão atualizando". Medido: o cron
// rodava sem erro 3× por dia, e nenhuma GRD nova entrava desde 31/08 — faltavam a 482 a 515 (01/09 a
// 29/09). A comparação "mudou?" era de TEXTO: o Graph manda "2026-01-24T19:09:42Z" e o banco devolve
// "2026-01-24T19:09:42.000Z". As 514 da pasta pareciam alteradas, o limite de 40 pegava sempre as
// primeiras da lista (GRD-00, 01, 02…) e as novas, no fim, nunca chegavam a ser lidas.

const arq = (n, mod, rev = 0) => ({ id: `id${n}_${rev}`, name: `FORM 09 - GRD-${n}_R${String(rev).padStart(2, "0")}.xlsx`, lastModifiedDateTime: mod });
const noBanco = (a) => ({ itemId: a.id, modificadoEm: new Date(a.lastModifiedDateTime) });

describe("o que a sincronização da pasta 13. GRD lê em cada rodada", () => {
  it("arquivo que não mudou não é relido — mesmo o banco devolvendo a data com milissegundo", () => {
    const a = arq(1, "2026-01-24T19:09:42Z");
    expect(arquivosPendentes([a], [noBanco(a)])).toEqual([]);
  });

  it("a GRD nova entra, mesmo com 480 antigas na frente dela na lista", () => {
    const antigas = Array.from({ length: 480 }, (_, i) => arq(i, "2026-08-01T10:00:00Z"));
    const nova = arq(515, "2026-09-29T16:29:26Z");
    expect(arquivosPendentes([...antigas, nova], antigas.map(noBanco), 40).map((a) => a.name)).toEqual(["FORM 09 - GRD-515_R00.xlsx"]);
  });

  it("arquivo alterado de verdade é relido", () => {
    const a = arq(7, "2026-09-10T08:00:00Z");
    expect(arquivosPendentes([a], [{ itemId: a.id, modificadoEm: new Date("2026-08-01T10:00:00Z") }])).toEqual([a]);
  });

  it("com mais pendências que o limite, as NOVAS vêm antes das alteradas, das mais antigas para as mais novas", () => {
    const alterada = arq(3, "2026-09-20T08:00:00Z");
    const novas = [arq(483, "2026-09-02T09:00:00Z"), arq(482, "2026-09-01T09:00:00Z")];
    const r = arquivosPendentes([alterada, ...novas], [{ itemId: alterada.id, modificadoEm: new Date("2026-08-01T10:00:00Z") }], 2);
    expect(r.map((a) => a.name)).toEqual(["FORM 09 - GRD-482_R00.xlsx", "FORM 09 - GRD-483_R00.xlsx"]);
  });
});

describe("quais arquivos da pasta são GRD", () => {
  it("nome com espaço antes do .xlsx também é GRD (a 392, a 411 e a 413 ficavam de fora)", () => {
    expect(RX_GRD.test("FORM 09 - GRD-392_R00 .xlsx")).toBe(true);
    expect(RX_GRD.test("FORM 09 - GRD-515_R01.xlsx")).toBe(true);
  });

  it("modelo e matriz continuam fora", () => {
    expect(RX_GRD.test("Matriz GRD.xlsx")).toBe(false);
    expect(RX_GRD.test("FORM 09 GUIA DE REMESSA DE DOCUMENTOS GRD R0.xlsx")).toBe(false);
  });
});
