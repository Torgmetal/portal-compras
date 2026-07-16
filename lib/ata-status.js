// Situação de uma atividade da ata de reunião.
//
// No BANCO (AtaAtividade.status) só existem 3 valores, e eles dizem apenas se a
// pessoa respondeu e como:
//   PENDENTE      -> ninguém respondeu ainda
//   EM_ANDAMENTO  -> respondeu; a tarefa continua
//   CONCLUIDA     -> respondeu; a tarefa acabou
//
// "ATRASADA" NÃO é um status guardado: é DERIVADO do prazo. Uma tarefa sem
// resposta só está atrasada depois que o prazo vence — antes disso ela está
// apenas PENDENTE (aguardando). Sem prazo, o limite é a semana da ata: passada
// a reunião seguinte (dataReuniao + 7 dias), o que não foi respondido atrasou.
//
// EM_ABERTO (o que NÃO foi concluído) é o que ARRASTA pra ata da semana
// seguinte — vale tanto pra pendente quanto pra atrasada, porque as duas são
// PENDENTE no banco.

export const ATIVIDADE_STATUS = ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA"];
export const STATUS_AO_RESPONDER = ["EM_ANDAMENTO", "CONCLUIDA"];
export const EM_ABERTO = ["PENDENTE", "EM_ANDAMENTO"];

// situações de EXIBIÇÃO (inclui a derivada ATRASADA)
export const SITUACOES = ["PENDENTE", "ATRASADA", "EM_ANDAMENTO", "CONCLUIDA"];
export const SITUACAO_LABEL = {
  PENDENTE: "Pendente",
  ATRASADA: "Atrasada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
};

const DIA = 86400000;
const utc0 = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()); };

export const respondida = (a) => a?.status === "EM_ANDAMENTO" || a?.status === "CONCLUIDA";
export const ehConcluida = (s) => s === "CONCLUIDA";
export const ehEmAberto = (s) => EM_ABERTO.includes(s || "PENDENTE");

/**
 * Situação de exibição da atividade.
 * @param {{status?:string, prazo?:any}} a atividade
 * @param {{dataReuniao?:any}} ata ata dona (usada quando a atividade não tem prazo)
 * @param {Date} agora
 * @returns {"PENDENTE"|"ATRASADA"|"EM_ANDAMENTO"|"CONCLUIDA"}
 */
export function situacaoAtividade(a, ata, agora = new Date()) {
  const s = a?.status || "PENDENTE";
  if (s === "CONCLUIDA" || s === "EM_ANDAMENTO") return s;
  const limite = a?.prazo
    ? utc0(a.prazo)
    : ata?.dataReuniao ? utc0(ata.dataReuniao) + 7 * DIA : null;
  if (limite == null) return "PENDENTE"; // sem prazo e sem data da reunião: não dá pra dizer que atrasou
  return utc0(agora) > limite ? "ATRASADA" : "PENDENTE";
}

export const situacaoLabel = (s) => SITUACAO_LABEL[s] || SITUACAO_LABEL.PENDENTE;
