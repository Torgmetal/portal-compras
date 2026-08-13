// Constantes da Auditoria Externa (relatório interno). Reaproveita os tipos de
// constatação da auditoria interna e o 5W2H do plano de ação (puro JS).

export const numRAE = (n) => `RAE-${String(n ?? 0).padStart(3, "0")}`;

// Constatações — mesmos tipos da interna (Conformidade / Não-conformidade / Melhoria).
export { TIPO_CONSTATACAO, TIPOS, tipoLabel } from "@/lib/auditoria-interna";

// Plano de ação 5W2H próprio da externa — mesmas colunas/status do plano de ação da Qualidade.
export { COLUNAS_5W2H, STATUS_ITEM, SITUACAO_ITEM, STATUS_ITEM_OPCOES, situacaoItem, situacaoItemLabel } from "@/lib/plano-acao";

// Ações do plano ainda em aberto (têm o "o quê" e não estão concluídas).
export const acoesPlanoValidas = (plano) => (Array.isArray(plano) ? plano.filter((a) => (a?.oque || "").trim()) : []);
export const acoesPlanoPendentes = (plano) => acoesPlanoValidas(plano).filter((a) => a?.status !== "CONCLUIDO");
