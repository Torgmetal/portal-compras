// Constantes do RNC — Relatório de Não Conformidade (FORM 20). Puro JS (client+server).

export const numRNC = (n, ano) => `RNC-${String(n).padStart(3, "0")}/${String(ano).slice(-2)}`;

export const TIPOS_RNC = {
  INTERNA: { label: "Interna", curto: "Interna" },
  CLIENTE: { label: "Cliente", curto: "Cliente" },
};

export const ORIGEM_NC = {
  PROCESSO: "Processo", PRODUTO: "Produto", CLIENTE: "Cliente", FORNECEDOR: "Fornecedor",
  AUDITORIA_INTERNA: "Auditoria interna", AUDITORIA_EXTERNA: "Auditoria externa", INDICADOR: "Indicador",
};

export const DISPOSICAO_NC = {
  APROVAR_CONCESSAO: "Aprovar sob concessão / usar como está",
  RETRABALHAR: "Retrabalhar", REFUGAR: "Refugar", DEVOLVER_FORNECEDOR: "Devolver ao fornecedor",
};

export const NECESSITA_ACAO = { CORRETIVA: "Corretiva", PREVENTIVA: "Preventiva", NAO_NECESSARIO: "Não necessário" };

export const STATUS_RNC = {
  ABERTA: { label: "Aberta", cor: "bg-blue-100 text-blue-700" },
  EM_ACAO: { label: "Em ação", cor: "bg-amber-100 text-amber-700" },
  RESPONDIDA: { label: "Respondida", cor: "bg-indigo-100 text-indigo-700" },
  ENCERRADA: { label: "Encerrada", cor: "bg-emerald-600 text-white" },
};
export const statusRncLabel = (s) => STATUS_RNC[s]?.label || s;

// Prazo: dias até o vencimento (negativo = vencido). null se sem prazo/encerrada.
export const diasParaPrazo = (prazo, encerradaEm) => {
  if (!prazo || encerradaEm) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const p = new Date(prazo); p.setHours(0, 0, 0, 0);
  return Math.round((p - hoje) / 86400000);
};
