import { describe, it, expect } from "vitest";
import { ATUALIZACAO_TIPI, atualizacaoDe } from "@/lib/fiscal/vigencia-tipi";

// ─── ATÉ QUAL ATO A TIPI ESTÁ ATUALIZADA ─────────────────────────────────────
//
// ⚠⚠ "ATIVA" NUNCA FOI "VIGENTE". A planilha que a Receita publica não declara, dentro dela, a
// norma que a aprovou — e por isso toda auditoria saía com a ressalva de que o apontamento valia
// contra a tabela de hoje, não contra a comprovadamente vigente na data da nota. O PDF que a
// contabilidade enviou (23/09/2026) traz essa folha de rosto.

describe("atualizacaoDe — amarrada ao artefato conferido", () => {
  // ⚠⚠ É A AMARRA QUE IMPEDE A MENTIRA. Se a Receita publicar uma planilha nova, o hash muda, a
  // declaração deixa de valer sozinha e a ressalva VOLTA — em vez de a vigência de hoje se
  // arrastar para uma tabela que ninguém conferiu.
  it("vale para o sha256 conferido", () => {
    expect(atualizacaoDe(ATUALIZACAO_TIPI.sha256)).toBe(ATUALIZACAO_TIPI);
  });

  it.each([
    ["outro hash", "0000000000000000000000000000000000000000000000000000000000000000"],
    ["vazio", ""],
    ["nulo", null],
    ["prefixo parecido mas diferente", "d155f1baafb5039dcb74f97bb5abc1aec69f6760da9bd3f94a90bd40b33a2e9a"],
    // ⚠ Comparação do hash INTEIRO: bastava um prefixo para "quase igual" passar, e num campo cujo
    // propósito é dizer "é exatamente este arquivo" isso não serve.
    ["mesmo prefixo, resto diferente", "d155f1baafb4000000000000000000000000000000000000000000000000ffff"],
  ])("não vale para %s", (_, sha) => {
    expect(atualizacaoDe(sha)).toBeNull();
  });
});

describe("o conteúdo da declaração", () => {
  it("nomeia a norma base e até qual ato está atualizada", () => {
    expect(ATUALIZACAO_TIPI.norma).toMatch(/Decreto nº 11\.158, de 29 de julho de 2022/);
    expect(ATUALIZACAO_TIPI.atualizadaAte).toMatch(/Ato Declaratório Executivo RFB nº 1, de 30 de janeiro de 2026/);
  });

  // ⚠ A CADEIA INTEIRA, e não só o último ato: é ela que permite conferir se a nota de uma data
  // qualquer caiu antes ou depois de uma alteração.
  it("guarda os 18 atos, começando pelo decreto que aprovou", () => {
    expect(ATUALIZACAO_TIPI.atos).toHaveLength(18);
    expect(ATUALIZACAO_TIPI.atos[0]).toMatch(/Decreto nº 11\.158/);
    expect(ATUALIZACAO_TIPI.atos.at(-1)).toMatch(/nº 1, de 30 de janeiro de 2026/);
  });

  it("diz quem declarou, quando e contra o quê", () => {
    expect(ATUALIZACAO_TIPI.declaradoPor).toMatch(/Contabilidade/i);
    expect(ATUALIZACAO_TIPI.declaradoEm).toBe("2026-09-23");
    expect(ATUALIZACAO_TIPI.conferidoContra).toMatch(/PDF da TIPI enviado pela contabilidade/);
  });

  // ⚠⚠ O QUE A DECLARAÇÃO NÃO PROVA É PARTE DELA. Saber até qual ato a tabela está atualizada não
  // diz qual redação vigorava quando a nota de março de 2024 foi emitida — e é isso que impede a
  // ressalva de virar carimbo.
  it("declara por extenso o que NÃO prova", () => {
    expect(ATUALIZACAO_TIPI.naoProva).toMatch(/não estabelece qual redação vigorava/i);
    expect(ATUALIZACAO_TIPI.naoProva).toMatch(/nota anterior/);
  });
});

describe("⚠⚠ ISTO NÃO É VIGÊNCIA — e confundir as duas foi o erro da primeira versão", () => {
  // Eu gravei `vigenciaInicio: "2022-08-01"` (a data do decreto-base), `vigenciaDeclarada` virou
  // true e a ressalva SUMIU da tela. Três problemas: a data descrevia o decreto, não a redação
  // consolidada (que inclui atos de 2026); eu troquei "a tabela se identifica como atualizada até
  // X" por "esta redação vigorava em D"; e a auditoria e o simulador continuaram lendo a vigência
  // do BANCO (nula), mantendo a ressalva — o módulo discordando de si sobre o próprio fundamento.
  it("não expõe vigenciaInicio nenhuma", () => {
    expect(ATUALIZACAO_TIPI.vigenciaInicio).toBeUndefined();
    expect(Object.keys(ATUALIZACAO_TIPI)).not.toContain("vigenciaInicio");
  });

  it("o que ela NÃO prova diz explicitamente que não é vigência", () => {
    expect(ATUALIZACAO_TIPI.naoProva).toMatch(/NÃO é vigência/);
  });
});
