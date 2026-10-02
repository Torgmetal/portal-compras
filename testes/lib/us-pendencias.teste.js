// O ultrassom não tinha trava de assinatura (verificação dos modelos, 02/10/2026): a indicação lançada no
// celular, que nem tinha onde dar laudo, ia para assinatura sem avaliação.
import { describe, it, expect } from "vitest";
import { pendenciasParaAssinatura } from "@/lib/qualidade-campo";

describe("trava de assinatura do ultrassom", () => {
  it("peça sem indicação não trava (sai A sozinha no documento concluído)", () => {
    expect(pendenciasParaAssinatura({ tipo: "ULTRASSOM", marcas: ["T1"], linhas: [] })).toEqual([]);
  });
  it("indicação sem laudo aponta a peça", () => {
    const rel = { tipo: "ULTRASSOM", linhas: [{ peca: "T103A1", indicacao: "1", laudo: "" }, { peca: "T103A2", laudo: "REC" }] };
    expect(pendenciasParaAssinatura(rel)).toEqual(["Laudo em branco na indicação de: T103A1."]);
  });
  it("aprovado com indicação reprovada é o documento dizendo duas coisas", () => {
    const rel = { tipo: "ULTRASSOM", resultadoInspecao: "APROVADO", linhas: [{ peca: "T103A1", laudo: "R" }] };
    expect(pendenciasParaAssinatura(rel)).toEqual(["Resultado APROVADO com indicação reprovada (T103A1) — confira o resultado."]);
  });
});

describe("números da tabela do ultrassom", () => {
  it("saem com vírgula, como o dimensional; texto que não é número sai como foi escrito", async () => {
    const { extractText } = await import("unpdf");
    const { gerarPDFdoRelatorio } = await import("@/lib/relatorio-render");
    const rel = { tipo: "ULTRASSOM", codigo: "RUS-103-009", opNumero: "103", revisao: 0, marcas: ["T103A1"], resultados: {}, equipamentos: [],
      linhas: [{ peca: "T103A1", indicacao: "1", angulo: "69.5", percurso: "120.25", db_indicacao: "52", db_referencia: "48", face: "A", laudo: "R" }] };
    const { text } = await extractText(new Uint8Array(await gerarPDFdoRelatorio({ rel })), { mergePages: true });
    expect(text).toContain("69,5");
    expect(text).toContain("120,25");
    expect(text).not.toContain("69.5");
  });
});
