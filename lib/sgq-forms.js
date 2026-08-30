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
//   · FORM 22 (Romaneio Cliente) — o documento sai do .xlsm oficial, que já traz a identificação.
//   · FORM 10, 11, 12, 13, 17, 18 e 19 — INATIVOS no índice. A Qualidade aposentou o formulário
//     quando o portal assumiu o registro, então carimbar o número seria alegar conformidade a um
//     formulário que o SGQ não reconhece mais.
//
// O FORM 20 estava nessa lista e saiu: Vitor (30/08/2026) decidiu REATIVAR e subir revisão — o
// módulo de RNC do portal é o sucessor do RTNC, e não um substituto informal.
//
// O FORM 21 também entrou. A dúvida era a Lista de Expedição do portal trazer colunas que o modelo
// não tem (Expedido, Pendente, Romaneio, Data expedida); Vitor: "não tem problema, foi uma melhoria
// que fizemos". É o caso exemplar de por que a revisão sobe: o formulário mudou, e mudou para
// melhor. ⚠ A LPC continua fora — `LPC_...` é lista de FABRICAÇÃO, não a LE.
//
// ⚠⚠ A REVISÃO QUE SAI É A DO PORTAL, NÃO A DO MODELO ANTIGO. Vitor (30/08/2026): "nos casos dos
// relatórios que já temos form definido precisamos constar como uma rev no form no rodapé". O
// layout que o portal emite não é o do modelo que a Qualidade tem em Excel/Word — e formulário com
// layout diferente é revisão nova, que é exatamente o que a §7.5.3.2 manda controlar. Então o
// documento emitido se declara `Rev.01`, e `revModelo` fica registrado para dar para reconstituir
// de onde ele veio.
//
// ⚠ ISSO PEDE UMA CONTRAPARTIDA FORA DAQUI: o índice mestre da Qualidade ainda registra R00 nos
// quatro. Enquanto ele não for atualizado, o índice diz uma coisa e o documento diz outra — que é
// achado de auditoria por si só. Atualizar o índice é ato da Qualidade, não do portal.
export const FORMS = {
  20: { nome: "Relatório e Tratativa de Não Conformidade (RTNC)", revModelo: "00", rev: "01" },
  21: { nome: "Lista Geral do Projeto", revModelo: "00", rev: "01" },
  26: { nome: "Romaneio Terceiros", revModelo: "00", rev: "01" },
  28: { nome: "Plano de Mudança e Melhorias - 5W 2H", revModelo: "00", rev: "01" },
  29: { nome: "Planejamento e Programação de Auditorias Internas", revModelo: "00", rev: "01" },
  31: { nome: "Relatório de Auditoria Interna", revModelo: "00", rev: "01" },
};

/**
 * A referência do formulário para carimbar no documento: `FORM 28 Rev.01`.
 *
 * O formato "planilha" reproduz o carimbo que o próprio modelo .xlsm da Torg já traz na célula G7,
 * logo acima de "ESTE DOCUMENTO FAZ PARTE DO SISTEMA DE GESTÃO DA QUALIDADE": `(FORM 22 Rev.00)`.
 *
 * ⚠ a revisão é a do FORMULÁRIO, não a do registro emitido. A revisão do registro (quando existe,
 * como no cronograma de auditoria, que vai a R05) continua sendo mostrada à parte — são duas coisas
 * diferentes e um rodapé que as confundisse não deixaria ninguém saber qual versão do formulário
 * foi usada.
 *
 * @param {number} numero  o número do formulário no índice
 * @returns {string} vazio quando o número não está registrado — sem inventar carimbo
 */
export function refFORM(numero, { formato = "curto" } = {}) {
  const f = FORMS[numero];
  if (!f) return "";
  const n = String(numero).padStart(2, "0");
  const ref = `FORM ${n} Rev.${f.rev}`;
  return formato === "planilha" ? `(${ref})` : ref;
}
