// Requisitos de qualidade / certificados que entram na observação do pedido de compra
// no Omie — SÓ para RMs de matéria-prima (tipoRM ENGENHARIA). Aprovado por Matheus (28/08/2026),
// adaptado do modelo de requisitos da Danpower.
export const TEXTO_CERTIFICADO_QUALIDADE = [
  "MATÉRIA PRIMA — REQUISITOS DE QUALIDADE (OBRIGATÓRIOS):",
  "- MATERIAIS CONFORME A NORMA APLICÁVEL (ABNT/ASTM), EM SUA ÚLTIMA EDIÇÃO/REVISÃO VIGENTE;",
  "- MATERIAIS DEVERÃO SER FORNECIDOS COM A MARCAÇÃO ORIGINAL DA USINA/FABRICANTE;",
  "- NÃO ACEITAMOS MATERIAL SEM CERTIFICADO DE QUALIDADE DE ORIGEM (COM RASTREABILIDADE DE CORRIDA/LOTE);",
  "- OS CERTIFICADOS DEVERÃO CONTER A NORMA APLICÁVEL E O ANO DE EDIÇÃO;",
  "- MATERIAIS DE ORIGEM IMPORTADA DEVERÃO SER PREVIAMENTE AUTORIZADOS PELO DEPTO. DE COMPRAS DA TORG METAL;",
  "- OS CERTIFICADOS DE QUALIDADE DEVERÃO SER ENVIADOS FISICAMENTE JUNTO À ENTREGA DA MERCADORIA OU PELOS E-MAILS ALMOXARIFADO@TORG.COM.BR E QUALIDADE@TORG.COM.BR ANTES DO ENVIO DO PRODUTO.",
].join("\n");

/** Anexa os requisitos de qualidade à observação, só se a RM for de matéria-prima (ENGENHARIA). */
export function comCertificadoQualidade(observacao, tipoRM) {
  if (tipoRM !== "ENGENHARIA") return observacao;
  return [observacao, TEXTO_CERTIFICADO_QUALIDADE].filter(Boolean).join("\n\n");
}
