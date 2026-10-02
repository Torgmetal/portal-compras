// O LP ia para assinatura sem linha, com linha sem laudo e sem instrumento (verificação dos modelos,
// 02/10/2026) — a trava que todos os outros relatórios já tinham.
import { describe, it, expect } from "vitest";
import { pendenciasParaAssinatura } from "@/lib/qualidade-campo";

const completo = () => ({
  tipo: "LP", resultadoInspecao: "APROVADO", equipamentos: [{ id: "lx", nome: "Luxímetro" }],
  resultados: { tipoPenetrante: "II" }, linhas: [{ marca: "T89A1", laudo: "A" }, { marca: "T89A2", laudo: "REC" }],
});

describe("trava de assinatura do LP", () => {
  it("completo passa", () => {
    expect(pendenciasParaAssinatura(completo())).toEqual([]);
  });
  it("sem linha, sem laudo, sem penetrante e sem instrumento: diz cada um", () => {
    const rel = { ...completo(), equipamentos: [], resultados: {}, linhas: [] };
    const p = pendenciasParaAssinatura(rel).join(" ");
    expect(p).toMatch(/Nenhuma junta registrada/);
    expect(p).toMatch(/Tipo de penetrante em branco/);
    expect(p).toMatch(/Nenhum instrumento/);
    const semLaudo = { ...completo(), linhas: [{ marca: "T89A1", laudo: "" }, { marca: "T89A2", laudo: "A" }] };
    expect(pendenciasParaAssinatura(semLaudo)).toContain("Laudo em branco em: T89A1.");
  });
  it("aprovado com junta reprovada é o documento dizendo duas coisas", () => {
    const rel = { ...completo(), linhas: [{ marca: "T89A1", laudo: "R" }] };
    expect(pendenciasParaAssinatura(rel)).toContain("Resultado APROVADO com junta reprovada (T89A1) — confira o resultado.");
    expect(pendenciasParaAssinatura({ ...rel, resultadoInspecao: "REPROVADO" })).toEqual([]);
  });
});
