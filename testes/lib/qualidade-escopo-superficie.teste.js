// Sais e poeira (02/10/2026) são ensaios da preparação de superfície — parte do controle da PINTURA
// (PO-05). Eles ACOMPANHAM a pintura no escopo da obra: onde a OP tem pintura, os dois ficam
// disponíveis, inclusive nas obras que salvaram o escopo antes de eles existirem (sem isso, a criação
// devolveria 409 "a obra não prevê" e o celular nem os listaria).
import { describe, it, expect } from "vitest";
import { tiposDaOP, tipoNoEscopo, normalizarEscopo, secoesForaDoEscopo, TIPOS_ESCOPAVEIS, PRESETS } from "@/lib/qualidade-escopo";

const op = (tipos, preset = "PERSONALIZADO") => ({ escopoQualidade: { tipos, preset } });
const COMPLETO_ANTIGO = ["DIMENSIONAL", "VISUAL_SOLDA", "ULTRASSOM", "PINTURA", "LP", "PRE_MONTAGEM"];

describe("sais e poeira acompanham a pintura no escopo", () => {
  it("obra com escopo Completo salvo antes deles: os dois aparecem", () => {
    const ids = tiposDaOP(op(COMPLETO_ANTIGO, "COMPLETO")).map((t) => t.id);
    expect(ids).toContain("SAIS");
    expect(ids).toContain("POEIRA");
    expect(tipoNoEscopo(op(COMPLETO_ANTIGO, "COMPLETO"), "SAIS")).toBe(true);
  });

  it("obra só com pintura: também", () => {
    expect(tipoNoEscopo(op(["PINTURA"], "PINTURA"), "POEIRA")).toBe(true);
  });

  it("obra sem pintura no escopo: não", () => {
    expect(tipoNoEscopo(op(["DIMENSIONAL", "VISUAL_SOLDA"]), "SAIS")).toBe(false);
    expect(tiposDaOP(op(["DIMENSIONAL"])).map((t) => t.id)).not.toContain("POEIRA");
  });

  it("obra sem escopo definido: tudo disponível, inclusive os dois", () => {
    expect(tipoNoEscopo({}, "SAIS")).toBe(true);
    expect(tiposDaOP({}).map((t) => t.id)).toEqual(expect.arrayContaining(["SAIS", "POEIRA", "PINTURA"]));
  });

  it("não viram caixa no escopo da OP — e o Completo salvo continua sendo Completo, não Personalizado", () => {
    expect(TIPOS_ESCOPAVEIS.map((t) => t.id)).not.toContain("SAIS");
    expect(TIPOS_ESCOPAVEIS.map((t) => t.id)).not.toContain("POEIRA");
    expect(normalizarEscopo({ tipos: COMPLETO_ANTIGO }).preset).toBe("COMPLETO");
    expect(PRESETS.find((p) => p.id === "COMPLETO").tipos).not.toContain("SAIS");
  });

  it("a §14 do data book segue a mesma regra: N/A só sem pintura", () => {
    expect(secoesForaDoEscopo(op(["PINTURA"]))).not.toContain("14");
    expect(secoesForaDoEscopo(op(["DIMENSIONAL"]))).toContain("14");
  });
});
