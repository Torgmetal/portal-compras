// Constantes client-safe da solicitação de produção (sem prisma — pode ser
// importado por componentes "use client").

// Setores de produção na ordem do fluxo (+ expedição como marco final)
export const SETORES_SOLICITACAO = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];

export const SETOR_LABEL_SOLIC = {
  CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento",
  JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição",
};

export const STATUS_SOLIC = {
  SOLICITADA: { label: "Solicitada", cor: "bg-blue-100 text-blue-700" },
  PROGRAMADA: { label: "Programada", cor: "bg-indigo-100 text-indigo-700" },
  EM_PRODUCAO: { label: "Em produção", cor: "bg-amber-100 text-amber-700" },
  ATRASADA: { label: "Atrasada", cor: "bg-red-100 text-red-700" },
  CONCLUIDA: { label: "Concluída", cor: "bg-emerald-100 text-emerald-700" },
};
