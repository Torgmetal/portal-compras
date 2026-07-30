// Cor determinística por Área do cronograma — MESMA cor no app (CSS hex) e no
// PDF (pdf-lib usa rgb 0..1). Sem "server-only" nem React: importável pelos dois.
// A cor sai do nome da área (case-insensitive), então "Área A" é sempre a mesma
// tanto na tela quanto no PDF exportado.

const hex01 = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

const PALETA = [
  { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" }, // âmbar
  { bg: "#DBEAFE", border: "#3B82F6", text: "#1E40AF" }, // azul
  { bg: "#DCFCE7", border: "#22C55E", text: "#166534" }, // verde
  { bg: "#EDE9FE", border: "#8B5CF6", text: "#5B21B6" }, // roxo
  { bg: "#FCE7F3", border: "#EC4899", text: "#9D174D" }, // rosa
  { bg: "#CFFAFE", border: "#06B6D4", text: "#155E75" }, // ciano
  { bg: "#FFEDD5", border: "#F97316", text: "#9A3412" }, // laranja
  { bg: "#CCFBF1", border: "#14B8A6", text: "#115E59" }, // teal
  { bg: "#FEE2E2", border: "#EF4444", text: "#991B1B" }, // vermelho
  { bg: "#E0E7FF", border: "#6366F1", text: "#3730A3" }, // índigo
].map((c) => ({ ...c, rgb: { bg: hex01(c.bg), border: hex01(c.border), text: hex01(c.text) } }));

// Cor estável a partir do nome da área.
export function corDaArea(area) {
  const s = String(area || "").trim().toLowerCase();
  if (!s) return PALETA[0];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return PALETA[Math.abs(h) % PALETA.length];
}

export const PALETA_AREAS = PALETA;
