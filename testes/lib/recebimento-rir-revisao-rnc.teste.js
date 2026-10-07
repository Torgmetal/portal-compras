// Reinspeção e RNC dos recebimentos por certificado (07/10/2026). A revisão nova é outra conferência: as
// três marcas de cada item voltam em branco, mas os certificados escolhidos ficam (não se escolhe de novo o
// que já foi recebido). E a RNC aberta pela reprovação diz QUAL item, com certificado e lote, e QUAL
// inspeção reprovou — o PO-07 cobra análise de causa, e "recebimento reprovado" sozinho não é causa.
import { describe, it, expect } from "vitest";
import { proximaRevisao } from "@/lib/revisao-inspecao";
import { descreverReprovacao } from "@/lib/rnc-de-inspecao";

const itens = [
  { docId: "d1", r: "261266", descricao: "REVELADOR DE TRINCAS METALCHECK D-70", certificado: "202600149", lote: "LT-26-1228", nf: "325883", visual: "A", dimensional: "NA", documentos: "R", rnc: "RNC-031/26" },
  { docId: "d2", r: "", descricao: "PENETRANTE VP-30", certificado: "202600150", lote: "LT-26-1229", nf: "325883", validade: "2026-09-30", visual: "A", dimensional: "NA", documentos: "A", rnc: "" },
];
const rel = { tipo: "RECEBIMENTO_PENETRANTE", codigo: "RRP-102-001", revisao: 0, resultadoInspecao: "REPROVADO", linhas: [],
  resultados: { contrato: "4600123456", dataInspecao: "2026-10-07", itens } };

describe("revisão nova do recebimento por certificado", () => {
  it("limpa as três marcas e a data; os certificados e o nº da RNC ficam; o R00 fica congelado", () => {
    const r = proximaRevisao(rel);
    expect(r.revisao).toBe(1);
    expect(r.resultados.dataInspecao).toBeNull();
    expect(r.resultados.itens.map((i) => [i.visual, i.dimensional, i.documentos])).toEqual([[null, null, null], [null, null, null]]);
    expect(r.resultados.itens.map((i) => i.certificado)).toEqual(["202600149", "202600150"]);
    expect(r.resultados.itens[0].rnc).toBe("RNC-031/26");
    expect(r.resultados.contrato).toBe("4600123456");
    expect(r.revisoes[0].resultados.itens[0].documentos).toBe("R");
  });
});

describe("RNC do recebimento por certificado", () => {
  it("diz o item, o certificado, o lote, a NF e o que reprovou — inclusive validade vencida", () => {
    const t = descreverReprovacao(rel);
    expect(t).toContain("Recebimento de penetrante e revelador reprovado.");
    expect(t).toContain("Item 1 — REVELADOR DE TRINCAS METALCHECK D-70, certificado 202600149, lote LT-26-1228, NF 325883: documentação.");
    expect(t).toContain("Item 2 — PENETRANTE VP-30, certificado 202600150, lote LT-26-1229, NF 325883: validade vencida (30/09/2026).");
    expect(t).not.toContain("Sem detalhamento");
  });
});
