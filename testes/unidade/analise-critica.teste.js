import { describe, it, expect } from "vitest";
import { verificacoesAutomaticas, pesoContratado, registroInicial, resumo, registroSchema } from "@/lib/analise-critica";

const itensOP118 = [
  { descricao: "CHAPAS E PERFIS", unidade: "KG", qtdContratada: 116254.04, categoria: "MATERIA_PRIMA" },
  { descricao: "GRADES E DEGRAUS", unidade: "KG", qtdContratada: 22394.8, categoria: "OUTRO" },
  { descricao: "PARAFUSOS, PORCAS E ARRUELAS", unidade: "KG", qtdContratada: 116254.04, categoria: "PARAFUSOS" },
  { descricao: "POLIURETANO 100 MICRAS", unidade: "M²", qtdContratada: 5427.53, categoria: "TINTA" },
  { descricao: "FRETE", unidade: null, qtdContratada: null, categoria: "SERV_FRETES_ENTREGA" },
];

describe("análise crítica — peso contratado", () => {
  it("soma os itens em kg e ignora o item de parafusos (que só usa o peso como base de preço)", () => {
    expect(pesoContratado(itensOP118)).toBeCloseTo(138648.84, 1);
  });
});

describe("análise crítica — verificações automáticas", () => {
  it("LE dentro de 3 % do contrato é OK; LPC × LE dentro de 5 % é OK", () => {
    const pecas = [
      { fonte: "LE_IMPORT", tipoPeca: "CONJUNTO", pesoTotalKg: 136942 },
      { fonte: "LPC_IMPORT", tipoPeca: "CONJUNTO", pesoTotalKg: 117030 },
      { fonte: "LPC_IMPORT", tipoPeca: "CROQUI", pesoTotalKg: 999999 }, // croqui nunca soma
    ];
    const v = Object.fromEntries(verificacoesAutomaticas({ itens: itensOP118, pecas }).map((x) => [x.chave, x]));
    expect(v.le_contrato.situacao).toBe("OK");
    expect(v.le_contrato.resultado).toContain("98,8 %");
    expect(v.lpc_le.situacao).toBe("ATENCAO"); // 117 t × 137 t = 85 %
    expect(v.pintura.situacao).toBe("BLOQUEADO"); // listas sem área por peça
    expect(v.transporte.situacao).toBe("BLOQUEADO"); // listas sem comprimento
  });
  it("sem LE diz que está bloqueado, não inventa OK", () => {
    const v = verificacoesAutomaticas({ itens: itensOP118, pecas: [] });
    expect(v.find((x) => x.chave === "le_contrato").situacao).toBe("BLOQUEADO");
  });
  it("LE acima do contrato em mais de 3 % é conflito; peça acima de 14 m é transporte especial", () => {
    const pecas = [
      { fonte: "LE_IMPORT", tipoPeca: "CONJUNTO", pesoTotalKg: 150000, marca: "T118A7", comprimentoMm: 14500 },
      { fonte: "LE_IMPORT", tipoPeca: "CONJUNTO", pesoTotalKg: 10, marca: "T118A8", comprimentoMm: 12600 },
    ];
    const v = Object.fromEntries(verificacoesAutomaticas({ itens: itensOP118, pecas }).map((x) => [x.chave, x]));
    expect(v.le_contrato.situacao).toBe("CONFLITO");
    expect(v.transporte.situacao).toBe("CONFLITO");
    expect(v.transporte.resultado).toContain("2 marca(s) acima de 12,4 m");
  });
});

describe("análise crítica — registro e resumo", () => {
  it("o registro novo já traz as entradas do FORM 08, as áreas do PO-13 §5.3 e as 20 saídas", () => {
    const r = registroInicial();
    expect(r.entradas).toHaveLength(5);
    expect(r.areas).toHaveLength(7);
    expect(r.saidas).toHaveLength(20);
    expect(registroSchema.safeParse(r).success).toBe(true);
  });
  it("resumo conta risco alto (≥ 9) e ação atrasada", () => {
    const r = { ...registroInicial(), riscos: [{ id: "a", risco: "x", probabilidade: 4, impacto: 4 }, { id: "b", risco: "y", probabilidade: 2, impacto: 2 }], acoes: [{ id: "c", acao: "z", quando: "2020-01-01", situacao: "A_FAZER" }] };
    const s = resumo(r);
    expect(s.riscos).toEqual({ total: 2, altos: 1, medios: 1 });
    expect(s.acoes.atrasadas).toBe(1);
  });
  it("rejeita risco com probabilidade fora de 1–4", () => {
    const r = { ...registroInicial(), riscos: [{ id: "a", risco: "x", probabilidade: 7, impacto: 1 }] };
    expect(registroSchema.safeParse(r).success).toBe(false);
  });
});
