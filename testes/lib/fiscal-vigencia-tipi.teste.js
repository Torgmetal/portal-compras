import { describe, it, expect } from "vitest";
import { VIGENCIA_TIPI, vigenciaDo } from "@/lib/fiscal/vigencia-tipi";

// ─── A VIGÊNCIA DECLARADA DA TIPI ────────────────────────────────────────────
//
// ⚠⚠ "ATIVA" NUNCA FOI "VIGENTE". A planilha que a Receita publica não declara, dentro dela, a
// norma que a aprovou — e por isso toda auditoria saía com a ressalva de que o apontamento valia
// contra a tabela de hoje, não contra a comprovadamente vigente na data da nota. O PDF que a
// contabilidade enviou (23/09/2026) traz essa folha de rosto.

describe("vigenciaDo — amarrada ao artefato conferido", () => {
  // ⚠⚠ É A AMARRA QUE IMPEDE A MENTIRA. Se a Receita publicar uma planilha nova, o hash muda, a
  // declaração deixa de valer sozinha e a ressalva VOLTA — em vez de a vigência de hoje se
  // arrastar para uma tabela que ninguém conferiu.
  it("vale para o sha256 conferido", () => {
    expect(vigenciaDo(VIGENCIA_TIPI.sha256)).toBe(VIGENCIA_TIPI);
  });

  it.each([
    ["outro hash", "0000000000000000000000000000000000000000000000000000000000000000"],
    ["vazio", ""],
    ["nulo", null],
    ["prefixo parecido mas diferente", "d155f1baafb5039dcb74f97bb5abc1aec69f6760da9bd3f94a90bd40b33a2e9a"],
  ])("não vale para %s", (_, sha) => {
    expect(vigenciaDo(sha)).toBeNull();
  });
});

describe("o conteúdo da declaração", () => {
  it("nomeia a norma base e até qual ato está atualizada", () => {
    expect(VIGENCIA_TIPI.norma).toMatch(/Decreto nº 11\.158, de 29 de julho de 2022/);
    expect(VIGENCIA_TIPI.atualizadaAte).toMatch(/Ato Declaratório Executivo RFB nº 1, de 30 de janeiro de 2026/);
  });

  // ⚠ A CADEIA INTEIRA, e não só o último ato: é ela que permite conferir se a nota de uma data
  // qualquer caiu antes ou depois de uma alteração.
  it("guarda os 18 atos, começando pelo decreto que aprovou", () => {
    expect(VIGENCIA_TIPI.atos).toHaveLength(18);
    expect(VIGENCIA_TIPI.atos[0]).toMatch(/Decreto nº 11\.158/);
    expect(VIGENCIA_TIPI.atos.at(-1)).toMatch(/nº 1, de 30 de janeiro de 2026/);
  });

  it("diz quem declarou, quando e contra o quê", () => {
    expect(VIGENCIA_TIPI.declaradoPor).toMatch(/Contabilidade/i);
    expect(VIGENCIA_TIPI.declaradoEm).toBe("2026-09-23");
    expect(VIGENCIA_TIPI.conferidoContra).toMatch(/PDF da TIPI enviado pela contabilidade/);
  });

  // ⚠⚠ O QUE A DECLARAÇÃO NÃO PROVA É PARTE DELA. Saber até qual ato a tabela está atualizada não
  // diz qual redação vigorava quando a nota de março de 2024 foi emitida — e é isso que impede a
  // ressalva de virar carimbo.
  it("declara por extenso o que NÃO prova", () => {
    expect(VIGENCIA_TIPI.naoProva).toMatch(/NÃO estabelece qual redação vigorava/);
    expect(VIGENCIA_TIPI.naoProva).toMatch(/nota anterior/);
  });
});
