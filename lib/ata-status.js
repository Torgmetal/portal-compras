// Status de uma atividade da ata de reunião.
//
// Sem resposta = ATRASADA: na cadência semanal, o que não foi respondido até a
// próxima reunião está atrasado (regra do Vitor). Ao responder, a pessoa diz se
// a tarefa ficou EM_ANDAMENTO ou CONCLUIDA.
//
// EM_ABERTO (atrasada + em andamento) é o que ARRASTA para a ata da semana
// seguinte, pra continuar em acompanhamento. Concluída não arrasta.

export const ATIVIDADE_STATUS = ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA"];
export const STATUS_AO_RESPONDER = ["EM_ANDAMENTO", "CONCLUIDA"];
export const EM_ABERTO = ["PENDENTE", "EM_ANDAMENTO"];

export const STATUS_LABEL = {
  PENDENTE: "Atrasada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
};

export const ehConcluida = (s) => s === "CONCLUIDA";
export const ehEmAberto = (s) => EM_ABERTO.includes(s || "PENDENTE");
export const statusLabel = (s) => STATUS_LABEL[s] || STATUS_LABEL.PENDENTE;
