// ─── OS FORMULÁRIOS DO SGQ ────────────────────────────────────────────────────
// Vitor (30/08/2026): "poderia transformar o que vc criou no portal para os respectivos forms do
// sgq quando exportarmos planilha ou pdf".
//
// A fonte é o índice mestre da Qualidade — `FORM - 00 - Lista de Informação Documentada.xlsx`,
// aba FORMULÁRIOS. Ele é a autoridade: 34 formulários, dos quais 20 ativos, 11 inativos e 3
// excluídos. Aqui ficam só os que o portal EMITE de verdade.
//
// ⚠⚠ SÓ ENTRA AQUI O QUE É O PRÓPRIO FORMULÁRIO. Relatório gerencial sobre um assunto não é o
// formulário daquele assunto, e carimbar "FORM 09" num histórico de liberações faria a planilha se
// passar por guia de remessa na auditoria. Ficaram de fora, de propósito:
//
//   · FORM 09 (Guia de Remessa GRD) — o portal exporta o CONTROLE das liberações, não a guia. A
//     guia real é uma remessa numerada (`FORM 09 - GRD-479_R00.xlsx`) e o portal não a emite.
//   · FORM 21 (Lista Geral do Projeto = a LE) — o portal IMPORTA a LE da Engenharia; não gera.
//     E a exportação `LPC_...` é a LPC, que é fabricação: outra lista, não esta.
//   · FORM 22 (Romaneio Cliente) — já preenche o .xlsm oficial, com o nome que ele traz.
//   · FORM 20 (RTNC) — marcado INATIVO no índice; o módulo de RNC o substituiu e mantém a
//     numeração própria. O mesmo vale para 10, 11, 12, 13, 17, 18 e 19: a Qualidade já aposentou
//     o formulário quando o portal assumiu.
//
// ⚠ A `rev` é a do MODELO no índice, e serve para conferência — não é ela que vai no nome. No nome
// vai a revisão do DOCUMENTO emitido (R00 na primeira emissão), que é como os arquivos preenchidos
// já estão nomeados no SharePoint: `FORM 09 - GRD-479_R00.xlsx`.
export const FORMS = {
  26: { nome: "Romaneio Terceiros", rev: "00" },
  28: { nome: "Plano de Mudança e Melhorias - 5W 2H", rev: "00" },
  29: { nome: "Planejamento e Programação de Auditorias Internas", rev: "00" },
  31: { nome: "Relatório de Auditoria Interna", rev: "00" },
};

/**
 * O nome de arquivo de um formulário preenchido, no padrão do SGQ.
 *
 *   nomeFORM(26, "RT-001", { ext: "xlsx" })            → "FORM 26 - RT-001_R00.xlsx"
 *   nomeFORM(29, "Auditorias Internas 2026", { revisao: 1 }) → "FORM 29 - Auditorias Internas 2026_R01.pdf"
 *
 * @param {number} numero        o número do formulário no índice
 * @param {string} identificador o que identifica ESTE documento (RT-001, PA-007, o ano…)
 * @param {{ext?: string, revisao?: number}} opts
 */
export function nomeFORM(numero, identificador, { ext = "pdf", revisao = 0 } = {}) {
  const n = String(numero).padStart(2, "0");
  // ⚠ o nome vai para Content-Disposition e para o disco: barra, dois-pontos e aspas quebram os
  // dois. `RNC-001/2026` viraria pasta no Windows.
  const id = String(identificador || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  const r = `R${String(Math.max(0, Number(revisao) || 0)).padStart(2, "0")}`;
  return `FORM ${n} - ${id}_${r}.${ext}`;
}
