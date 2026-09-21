// Hash estável dos itens de um romaneio prévio (marca × quantidade), igual no servidor e no navegador,
// para saber se a simulação gravada ainda corresponde ao romaneio. FNV-1a de 32 bits em hexa.
export function hashItens(itens) {
  const chave = (itens || []).map((i) => `${String(i.marca || "").toUpperCase()}|${Number(i.qte) || 0}`).sort().join(";");
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) { h ^= chave.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0") + "-" + (itens || []).length;
}
