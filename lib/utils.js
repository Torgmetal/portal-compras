export const uid = () => Math.random().toString(36).slice(2, 9);

export const today = () => new Date().toISOString().slice(0, 10);

export const fmt = (v) =>
  v != null
    ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

// Paleta Torg Metal: azuis + laranja, sem verde/roxo
export const STATUS_COLORS = {
  Aberta: "bg-torg-orange-100 text-torg-orange-700",
  "Em Cotação": "bg-torg-blue-100 text-torg-blue-700",
  Cotada: "bg-torg-blue-200 text-torg-blue-800",
  Aprovada: "bg-torg-blue-50 text-torg-dark border border-torg-blue-300",
  "Pedido Gerado": "bg-torg-dark text-white",
};
