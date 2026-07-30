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

export const normArea = (a) => String(a || "").trim().toLowerCase();

// Cor da área. PREFERE a cor FIXA registrada em `areas` ([{nome, cor}]) — assim
// renomear a área NÃO muda a cor e a mesma área tem a mesma cor em todo setor.
// Sem registro (área ainda não cadastrada), cai no hash do nome (estável por nome).
export function corDaArea(area, areas) {
  const key = normArea(area);
  if (!key) return PALETA[0];
  if (Array.isArray(areas)) {
    const e = areas.find((a) => normArea(a?.nome) === key);
    if (e && Number.isInteger(e.cor)) return PALETA[((e.cor % PALETA.length) + PALETA.length) % PALETA.length];
  }
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return PALETA[Math.abs(h) % PALETA.length];
}

// Próximo índice de cor livre pra registrar uma área nova (distintas nas 10 primeiras).
export function proximaCorArea(areas) {
  const usados = new Set((Array.isArray(areas) ? areas : []).map((a) => a?.cor).filter((c) => Number.isInteger(c)));
  for (let i = 0; i < PALETA.length; i++) if (!usados.has(i)) return i;
  return (Array.isArray(areas) ? areas.length : 0) % PALETA.length;
}

export const PALETA_AREAS = PALETA;
