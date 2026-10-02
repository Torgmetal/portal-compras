// O EVS ia para assinatura sem junta (o EVS-102-001 foi assim), sem laudo, sem soldador e sem instrumento
// (verificação dos modelos, 02/10/2026) — a trava que os outros relatórios já tinham.
import { describe, it, expect } from "vitest";
import { pendenciasParaAssinatura } from "@/lib/qualidade-campo";

const completo = () => ({
  tipo: "VISUAL_SOLDA", resultadoInspecao: "APROVADO", equipamentos: [{ id: "lx", nome: "Luxímetro" }],
  resultados: { iluminacao: "1250" },
  linhas: [{ marca: "T102A1", laudo: "A", soldador: "EBERTON", sinete: "S-02", descontinuidade: "" }],
});

describe("trava de assinatura do EVS", () => {
  it("completo passa", () => {
    expect(pendenciasParaAssinatura(completo())).toEqual([]);
  });
  it("sem junta, sem iluminação e sem instrumento: diz cada um", () => {
    const p = pendenciasParaAssinatura({ ...completo(), linhas: [], resultados: {}, equipamentos: [] }).join(" ");
    expect(p).toMatch(/Nenhuma junta lançada/);
    expect(p).toMatch(/Iluminação em branco/);
    expect(p).toMatch(/Nenhum instrumento/);
  });
  it("junta sem peça, sem laudo ou sem soldador aponta qual é", () => {
    const rel = { ...completo(), linhas: [{ marca: "", laudo: "", soldador: "" }, { marca: "T102A2", laudo: "A", sinete: "S-04" }] };
    const p = pendenciasParaAssinatura(rel);
    expect(p).toContain("Peça em branco na junta 1.");
    expect(p).toContain("Laudo em branco na junta 1.");
    expect(p.join(" ")).toMatch(/Soldador em branco na junta 1 —/); // a junta 2 tem o sinete: basta
  });
  it("trinca com laudo A e aprovado com junta R são o documento se contradizendo", () => {
    const comTrinca = { ...completo(), linhas: [{ ...completo().linhas[0], descontinuidade: "TL" }] };
    expect(pendenciasParaAssinatura(comTrinca).join(" ")).toMatch(/Descontinuidade que reprova com laudo A na junta 1/);
    const comR = { ...completo(), linhas: [{ ...completo().linhas[0], laudo: "R" }] };
    expect(pendenciasParaAssinatura(comR)).toContain("Resultado APROVADO com junta 1 reprovada — confira o resultado.");
  });
});
