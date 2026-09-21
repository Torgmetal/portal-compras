// CIF ou FOB — a pergunta operacional é "preciso mandar buscar?".
import { describe, it, expect } from "vitest";
import { freteDe, FRETES, FRETES_VALIDOS, acaoFrete } from "@/lib/frete-cotacao";

describe("freteDe", () => {
  it("normaliza o que vem do banco", () => {
    expect(freteDe({ tipoFrete: "cif" })).toBe("CIF");
    expect(freteDe({ tipoFrete: " FOB " })).toBe("FOB");
  });

  // ⚠ Cotação antiga e lançamento manual não têm frete. `null` é a resposta honesta — chutar CIF
  // faria a tela dizer que o material vem sozinho, e ninguém programaria a coleta.
  it("sem resposta é null, nunca um chute", () => {
    for (const c of [{}, { tipoFrete: null }, { tipoFrete: "" }, null, undefined]) {
      expect(freteDe(c)).toBeNull();
    }
  });

  it("valor fora da lista não passa", () => {
    expect(freteDe({ tipoFrete: "por conta deles" })).toBeNull();
    expect(freteDe({ tipoFrete: "C.I.F." })).toBeNull();
  });

  it("⚠ cada opção carrega a AÇÃO, não só a sigla", () => {
    expect(acaoFrete("FOB")).toBe("Coletar");
    expect(acaoFrete("CIF")).toBe("Entrega do fornecedor");
    for (const v of FRETES_VALIDOS) {
      expect(FRETES[v].legenda.length, v).toBeGreaterThan(20);
    }
  });
});
