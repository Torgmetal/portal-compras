// Seções padrão para organizar os documentos de uma auditoria (na tela interna e no
// portal do cliente). Plano JS puro — usado no client, no Torguinho e no endpoint.
export const SECOES_AUDITORIA = [
  "Sistema de Gestão e Procedimentos",
  "Soldagem e Qualificações",
  "Ensaios e Inspeções",
  "Pintura e Tratamento de Superfície",
  "Calibração de Instrumentos",
  "Certificados de Material",
  "Outros",
];

const MAP_CAT = {
  SISTEMA: "Sistema de Gestão e Procedimentos",
  FUNCIONARIOS: "Soldagem e Qualificações",
  INSPETORES: "Ensaios e Inspeções",
  EQUIPAMENTOS: "Calibração de Instrumentos",
  MATERIAL: "Certificados de Material",
};

// Categoria do DocumentoQualidade → seção sugerida na auditoria.
export function secaoPorCategoria(categoria) {
  return MAP_CAT[categoria] || "Outros";
}

// Ordena as seções na ordem padrão; desconhecidas vão pro fim (antes de "Sem seção").
export function ordenarSecoes(nomes) {
  const idx = (n) => { const i = SECOES_AUDITORIA.indexOf(n); return i === -1 ? 998 : i; };
  return [...nomes].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b));
}
