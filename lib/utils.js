export const uid = () => Math.random().toString(36).slice(2, 9);

export const today = () => new Date().toISOString().slice(0, 10);

export const fmt = (v) =>
  v != null
    ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

export const STATUS_COLORS = {
  Aberta: "bg-yellow-100 text-yellow-800",
  "Em Cotação": "bg-blue-100 text-blue-800",
  Cotada: "bg-purple-100 text-purple-800",
  Aprovada: "bg-green-100 text-green-800",
  "Pedido Gerado": "bg-emerald-100 text-emerald-800",
};
