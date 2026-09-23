// ─── A VIGÊNCIA DA TIPI, DECLARADA ───────────────────────────────────────────
//
// ⚠⚠ "ATIVA" NUNCA FOI "VIGENTE", E O PORTAL DIZIA ISSO EM TODO APONTAMENTO. A planilha que a
// Receita publica (`tipi.xlsx`) não declara, dentro dela, a norma que a aprovou nem até qual ato
// ela está atualizada. Por isso toda auditoria saía com a ressalva *"a TIPI de referência não tem
// vigência declarada"* — o apontamento valia contra a tabela que o portal usa HOJE, não contra a
// comprovadamente vigente na data de emissão da nota.
//
// ⚠⚠ O PDF DA CONTABILIDADE RESOLVEU ISSO — E SÓ ISSO. Matheus (23/09/2026) mandou a TIPI que a
// contabilidade enviou, perguntando se dava para *"complementar nossa base de NCMs que tributam
// IPI"*. A base de códigos e alíquotas NÃO precisava: ela já vem da planilha oficial da Receita,
// com 11.103 NCMs, 582 linhas de Ex e sha256. O que faltava era esta folha de rosto.
//
// ⚠⚠ E A DECLARAÇÃO ESTÁ AMARRADA AO sha256 DO ARQUIVO CONFERIDO. Se a Receita publicar uma
// planilha nova, o hash muda, esta declaração deixa de valer sozinha e a ressalva VOLTA. Sem essa
// amarra, a vigência de hoje se arrastaria para uma tabela que ninguém conferiu — que é
// exatamente a mentira que a ressalva existia para evitar.

export const VIGENCIA_TIPI = {
  /** ⚠ O artefato contra o qual a declaração foi conferida. Mudou o hash, mudou o assunto. */
  sha256: "d155f1baafb4039dcb74f97bb5abc1aec69f6760da9bd3f94a90bd40b33a2e9a",
  norma: "Decreto nº 11.158, de 29 de julho de 2022",
  vigenciaInicio: "2022-08-01",
  atualizadaAte: "Ato Declaratório Executivo RFB nº 1, de 30 de janeiro de 2026 (retificado no DOU de 12/02/2026)",
  declaradoPor: "Contabilidade da Torg Metal, via Matheus",
  declaradoEm: "2026-09-23",
  conferidoContra: "PDF da TIPI enviado pela contabilidade em 23/09/2026 (462 páginas, gerado em 13/02/2026), que se identifica na folha de rosto como a TIPI 2022 com os 18 atos de atualização abaixo.",
  /**
   * ⚠ A CADEIA DE ATOS INTEIRA, e não só o último. É ela que permite a alguém conferir se a nota
   * de uma data qualquer caiu antes ou depois de uma alteração — que é a pergunta que a auditoria
   * de nota antiga faz.
   */
  atos: [
    "Decreto nº 11.158, de 29 de julho de 2022",
    "Decreto nº 11.182, de 24 de agosto de 2022",
    "Ato Declaratório Executivo RFB nº 5, de 29 de agosto de 2022",
    "Ato Declaratório Executivo RFB nº 6, de 20 de dezembro de 2022",
    "Ato Declaratório Executivo RFB nº 2, de 22 de março de 2023",
    "Ato Declaratório Executivo RFB nº 3, de 03 de outubro de 2023",
    "Decreto nº 11.764, de 31 de outubro de 2023",
    "Decreto nº 11.970, de 1º de abril de 2024",
    "Ato Declaratório Executivo RFB nº 3, de 02 de abril de 2024",
    "Ato Declaratório Executivo RFB nº 4, de 08 de abril de 2024",
    "Ato Declaratório Executivo RFB nº 5, de 24 de junho de 2024",
    "Ato Declaratório Executivo RFB nº 6, de 30 de julho de 2024",
    "Ato Declaratório Executivo RFB nº 7, de 24 de setembro de 2024",
    "Ato Declaratório Executivo RFB nº 8, de 05 de novembro de 2024",
    "Ato Declaratório Executivo RFB nº 9, de 20 de dezembro de 2024",
    "Ato Declaratório Executivo RFB nº 3, de 23 de setembro de 2025",
    "Decreto nº 12.665, de 10 de outubro de 2025",
    "Ato Declaratório Executivo RFB nº 1, de 30 de janeiro de 2026",
  ],
  /**
   * ⚠⚠ O QUE A DECLARAÇÃO **NÃO** PROVA, dito por extenso — porque é isso que impede a ressalva de
   * virar carimbo. O portal passa a saber até qual ato a tabela está atualizada; continua sem saber
   * se uma nota de março de 2024 caiu antes ou depois do Decreto 11.970, e essa conferência é de
   * quem audita.
   */
  naoProva: "Diz até qual ato a tabela de referência está atualizada. NÃO estabelece qual redação vigorava na data de emissão de uma nota anterior: auditoria de nota antiga continua exigindo essa conferência.",
};

/**
 * A vigência vale para ESTE artefato?
 *
 * ⚠ A comparação é por prefixo porque o `sha256` guardado aqui é o do artefato conferido; mudou o
 * arquivo na origem, muda o hash, e a declaração para de valer — silenciosamente NÃO, com a
 * ressalva voltando à tela.
 */
export function vigenciaDo(sha256) {
  const a = String(sha256 ?? "");
  if (!a || !a.startsWith(VIGENCIA_TIPI.sha256.slice(0, 12))) return null;
  return VIGENCIA_TIPI;
}
