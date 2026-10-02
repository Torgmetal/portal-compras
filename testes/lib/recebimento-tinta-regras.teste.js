// A verificação do recebimento de tintas (02/10/2026) achou uma trava SEM SAÍDA: com lote vencido e os nove
// itens da embalagem aprovados, REPROVADO dava "não bate com os itens" e APROVADO dava "lote vencido
// aprovado" — nenhuma combinação ia para assinatura. Os itens são só da EMBALAGEM; reprova-se também por
// validade, produto trocado, falta de certificado. E a validade era conferida contra HOJE quando a data do
// recebimento ficava vazia, enquanto o PDF imprimia a data de emissão: o documento se contradizia.
import { describe, it, expect } from "vitest";
import {
  ITENS_RECEBIMENTO, pendenciasRecebimento, avisosRecebimento, dataReferenciaRecebimento, lotesVencidos,
  preencherDoCmr, resultadoExigidoRecebimento,
} from "@/lib/recebimento-tinta-campos";

const todosA = Object.fromEntries(ITENS_RECEBIMENTO.map((_, i) => [i + 1, "A"]));
const base = (res = {}, rel = {}) => ({
  createdAt: "2026-10-01T15:00:00Z", resultadoInspecao: "APROVADO", ...rel,
  resultados: { material: "Wegpoxi", fabricante: "WEG", dataInspecao: "2026-10-01", lotes: [{ lote: "L1", validade: "2027-03-15" }], checklist: todosA, ...res },
});
const vencido = { lotes: [{ lote: "L1", validade: "2026-09-30" }] };

describe("o resultado do recebimento", () => {
  it("lote vencido com os nove itens aprovados: REPROVADO vai para assinatura; APROVADO não", () => {
    expect(pendenciasRecebimento(base(vencido, { resultadoInspecao: "REPROVADO" }))).toEqual([]);
    expect(pendenciasRecebimento(base(vencido)).join(" ")).toMatch(/Lote vencido aprovado: componente A \(validade 30\/09\/2026\)/);
  });

  it("item reprovado não deixa aprovar; reprovar vai", () => {
    const comR = { checklist: { ...todosA, 4: "R" } };
    expect(pendenciasRecebimento(base(comR)).join(" ")).toMatch(/Aprovado com item reprovado \(4\)/);
    expect(pendenciasRecebimento(base(comR, { resultadoInspecao: "REPROVADO" }))).toEqual([]);
  });

  it("reprovar com tudo aprovado e nada vencido (produto trocado, sem certificado…) pede o motivo nas observações", () => {
    expect(pendenciasRecebimento(base({}, { resultadoInspecao: "REPROVADO" })).join(" ")).toMatch(/escreva o motivo nas observações/);
    expect(pendenciasRecebimento(base({}, { resultadoInspecao: "REPROVADO", observacoes: "Chegou o produto trocado (epóxi no lugar do PU)." }))).toEqual([]);
  });

  it("REC não se aplica ao recebimento — a pendência diz isso, e não 'não marcado'", () => {
    const p = pendenciasRecebimento(base({}, { resultadoInspecao: "REC" })).join(" ");
    expect(p).toMatch(/REC.*não se aplica/);
    expect(p).not.toMatch(/não marcado/);
  });

  it("o resultado exigido: REPROVADO com item R ou lote vencido; APROVADO com tudo certo; vazio enquanto falta item", () => {
    expect(resultadoExigidoRecebimento(base(vencido))).toBe("REPROVADO");
    expect(resultadoExigidoRecebimento(base({ checklist: { ...todosA, 2: "R" } }))).toBe("REPROVADO");
    expect(resultadoExigidoRecebimento(base())).toBe("APROVADO");
    expect(resultadoExigidoRecebimento(base({ checklist: { 1: "A" } }))).toBe("");
  });
});

describe("a data contra a qual a validade é conferida", () => {
  it("é a digitada; vazia, o dia da EMISSÃO (ou da criação) em São Paulo — a mesma que o PDF imprime", () => {
    expect(dataReferenciaRecebimento({ resultados: { dataInspecao: "2026-09-11" } })).toBe("2026-09-11");
    // 02h UTC do dia 12 ainda é dia 11 em São Paulo
    expect(dataReferenciaRecebimento({ emitidoEm: "2026-09-12T02:00:00Z", createdAt: "2026-09-01T12:00:00Z", resultados: {} })).toBe("2026-09-11");
    expect(dataReferenciaRecebimento({ createdAt: "2026-09-05T12:00:00Z", resultados: {} })).toBe("2026-09-05");
  });

  it("nunca hoje: emitido em 11/09 com validade 20/09 não fica 'vencido' depois que 20/09 passa", () => {
    const rel = base({ dataInspecao: "", lotes: [{ lote: "L1", validade: "2026-09-20" }] }, { emitidoEm: "2026-09-11T15:00:00Z" });
    expect(lotesVencidos(rel.resultados, dataReferenciaRecebimento(rel))).toEqual([]);
    expect(pendenciasRecebimento(rel)).toEqual([]);
  });

  it("data impossível (30/02) não vale como data do recebimento", () => {
    expect(dataReferenciaRecebimento({ createdAt: "2026-09-05T12:00:00Z", resultados: { dataInspecao: "2026-02-30" } })).toBe("2026-09-05");
  });
});

describe("validade em branco avisa, não trava", () => {
  it("lote sem validade (diluente sem data no rótulo) não segura a assinatura — e aparece como aviso", () => {
    const rel = base({ lotes: [{ lote: "L1", validade: "2027-01-01" }, { lote: "D-9" }] });
    expect(pendenciasRecebimento(rel)).toEqual([]);
    expect(avisosRecebimento(rel).join(" ")).toMatch(/componente B sem validade/i);
    expect(avisosRecebimento(base())).toEqual([]);
  });
});

describe("preencher pelo CMR", () => {
  it("lote do CMR sem número não apaga o lote digitado", () => {
    const r = preencherDoCmr({ lotes: [{ lote: "ABC-123" }] }, { A: { tipo: "W", fabricante: "WEG", validade: "2027-03-15" } });
    expect(r.lotes[0]).toMatchObject({ lote: "ABC-123", validade: "2027-03-15" });
  });

  it("material e certificado vêm do componente A: escolher só o B (o endurecedor) não vira o 'material'", () => {
    const r = preencherDoCmr({}, { B: { tipo: "ENDURECEDOR", produto: "ENDURECEDOR X", fabricante: "WEG", lote: "B1", certificado: "CQ-B" } });
    expect(r.material ?? "").toBe("");
    expect(r.certificado ?? "").toBe("");
    expect(r.fabricante).toBe("WEG");
    expect(r.lotes[1]).toMatchObject({ lote: "B1" });
  });

  it("a norma do CMR também preenche, sem apagar a digitada", () => {
    expect(preencherDoCmr({}, { A: { tipo: "W", norma: "N-2680", lote: "1" } }).norma).toBe("N-2680");
    expect(preencherDoCmr({ norma: "N-1" }, { A: { tipo: "W", norma: "N-2680", lote: "1" } }).norma).toBe("N-1");
  });

  it("validade do CMR que não é data não entra (e não apaga a digitada)", () => {
    const r = preencherDoCmr({ lotes: [{ lote: "L", validade: "2027-01-01" }] }, { A: { tipo: "W", lote: "L2", validade: "sem validade" } });
    expect(r.lotes[0]).toMatchObject({ lote: "L2", validade: "2027-01-01" });
  });
});
