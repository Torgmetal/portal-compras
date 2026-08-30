// ─── OS FORMULÁRIOS DO SGQ ────────────────────────────────────────────────────
// Vitor (30/08/2026): "vc não precisa nomear o documento como form (...) porém deve conter em algum
// campo o form que ele representa, não é isso, o que a ISO pede?"
//
// É isso. A ISO 9001:2015 §7.5.2 pede "identificação e descrição (por exemplo, título, data, autor
// ou número de referência)" e a §7.5.3.2 pede controle de alterações — e não diz uma palavra sobre
// nome de arquivo. Nome de arquivo é o pior lugar possível para a identificação: qualquer um
// renomeia, e ela não sobrevive à impressão, ao PDF virar anexo de e-mail nem a ele virar seção do
// Data Book. O que o auditor lê é o DOCUMENTO.
//
// ⚠ E o "padrão de nome" não era padrão. Varrendo o SharePoint, `FORM nn - ...` só aparece no GRD e
// num registro de calibração; FORM 22, 26, 28, 29 e 31 não têm um único arquivo nomeado assim. Era
// o hábito de quem emitia GRD, não regra do SGQ.
//
// Então: nome de arquivo livre e descritivo, e o número do formulário carimbado no rodapé, junto do
// número do registro e da data — que é o que a §7.5.2 chama de identificação.
//
// A fonte é o índice mestre da Qualidade — `FORM - 00 - Lista de Informação Documentada.xlsx`, aba
// FORMULÁRIOS: 34 formulários, 20 ativos, 11 inativos, 3 excluídos.
//
// ⚠⚠ SÓ ENTRA AQUI O QUE É O PRÓPRIO FORMULÁRIO. Relatório gerencial sobre um assunto não é o
// formulário daquele assunto, e carimbar "FORM 09" num histórico de liberações faria a planilha se
// passar por guia de remessa numa auditoria. Ficaram de fora, de propósito:
//
//   · FORM 09 (Guia de Remessa GRD) — o portal exporta o CONTROLE das liberações, não a guia. A
//     guia real é uma remessa numerada e o portal não a emite.
//   · FORM 21 (Lista Geral do Projeto = a LE) — o portal IMPORTA a LE da Engenharia; não gera. E a
//     exportação `LPC_...` é a LPC, que é fabricação: outra lista, não esta.
//   · FORM 22 (Romaneio Cliente) — o documento sai do .xlsm oficial, que já traz a identificação.
//   · FORM 20 (RTNC) — marcado INATIVO no índice; o mesmo vale para 10, 11, 12, 13, 17, 18 e 19.
//     A Qualidade aposentou o formulário quando o portal assumiu o registro, então carimbar o
//     número seria alegar conformidade a um formulário que o SGQ não reconhece mais.
export const FORMS = {
  26: { nome: "Romaneio Terceiros", rev: "00" },
  28: { nome: "Plano de Mudança e Melhorias - 5W 2H", rev: "00" },
  29: { nome: "Planejamento e Programação de Auditorias Internas", rev: "00" },
  31: { nome: "Relatório de Auditoria Interna", rev: "00" },
};

/**
 * A referência do formulário para carimbar no documento: `FORM 28 R00`.
 *
 * O formato "planilha" reproduz o carimbo que o próprio modelo .xlsm da Torg já traz na célula G7,
 * logo acima de "ESTE DOCUMENTO FAZ PARTE DO SISTEMA DE GESTÃO DA QUALIDADE": `(FORM 22 Rev.00)`.
 *
 * ⚠ a revisão é a do MODELO no índice, não a do registro emitido: ela diz em cima de qual versão do
 * formulário este registro foi feito, que é o que a §7.5.3.2 quer poder reconstituir. A revisão do
 * registro (quando existe, como no cronograma de auditoria) continua sendo mostrada à parte.
 *
 * @param {number} numero  o número do formulário no índice
 * @returns {string} vazio quando o número não está registrado — sem inventar carimbo
 */
export function refFORM(numero, { formato = "curto" } = {}) {
  const f = FORMS[numero];
  if (!f) return "";
  const n = String(numero).padStart(2, "0");
  return formato === "planilha" ? `(FORM ${n} Rev.${f.rev})` : `FORM ${n} R${f.rev}`;
}
