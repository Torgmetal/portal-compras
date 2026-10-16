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

// A emissão é uma data civil (o formulário grava ao meio-dia UTC). O prazo não
// reinicia quando alguém edita a RNC. O dia atual segue o calendário de São Paulo.
export function acompanhamentoEficacia(rnc, agora = new Date()) {
  if (!rnc?.data || rnc.status === "ENCERRADA" || rnc.encerradaEm) return null;
  const emissao = new Date(rnc.data);
  if (!Number.isFinite(emissao.getTime())) return null;
  const diaEmissao = emissao.toISOString().slice(0, 10);
  const prazo = new Date(`${diaEmissao}T00:00:00Z`);
  prazo.setUTCDate(prazo.getUTCDate() + 60);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(agora);
  const p = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  const hoje = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const diasRestantes = Math.round((prazo.getTime() - hoje) / 86400000);
  return {
    emissao: diaEmissao, avaliarEm: prazo.toISOString().slice(0, 10), diasRestantes,
    fase: diasRestantes > 0 ? "AGUARDANDO_EFICACIA" : "AVALIAR_EFICACIA",
  };
}
