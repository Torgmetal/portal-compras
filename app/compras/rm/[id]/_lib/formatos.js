

export const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export const STATUS_RM_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

export const STATUS_ITEM_LABELS = {
  PENDENTE:          { label: "Pendente",           className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:        { label: "Em cotação",         className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADO:            { label: "Cotado",             className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO:     { label: "Pedido gerado",      className: "bg-torg-dark text-white" },
  ATENDIDO_ESTOQUE:  { label: "Atendido (estoque)", className: "bg-emerald-100 text-emerald-700" },
  CANCELADO:         { label: "Cancelado",          className: "bg-gray-200 text-gray-500 line-through" },
};

// Variante: item marcado como COTADO mas fornecedor nao deu preço pra ele —
// mostra como "Sem proposta" pro usuario perceber que precisa re-cotar.
export const STATUS_SEM_PROPOSTA = { label: "Sem proposta", className: "bg-amber-50 text-amber-700" };
