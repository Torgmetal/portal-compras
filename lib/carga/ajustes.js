// Ajustes por MARCA do simulador de carga — o que a Expedição decide à mão e o motor respeita ao simular de novo.
// Vitor (13/09/2026): "no caso de ter que ajustar algum pacote ou peça como poderíamos ajustar?" — arrastar no 3D
// não vale a pena (o motor teria de revalidar apoio e altura a cada movimento); a lista de ajustes vale para
// os próximos romaneios da mesma obra. Gravados em AjusteCargaMarca (opId + marca).
//
// regras = { embalagem, juntoCom, posicao, orientacao, medidas, observacao }
export const EMBALAGEM = [
  ["", "Automática"], ["solta", "Não empacotar (peça solta)"], ["feixe", "Feixe cintado"], ["caixa", "Caixa de madeira"],
  ["engradado", "Engradado deitado"], ["emPe", "Em pé em engradado"],
];
export const POSICAO = [["", "Automática"], ["chao", "No chão"], ["topo", "Só em cima (nada sobe nela)"], ["nadaEmCima", "Nada em cima dela"]];
export const ORIENTACAO = [["", "Automática"], ["deitar", "Deitar (menor lado para baixo)"], ["almaVertical", "Alma em pé"]];

const opcao = (lista, v) => (lista.some(([k]) => k === v) && v) || "";
/** Limpa e valida um objeto de regras; devolve null se ficar vazio. */
export function normalizarRegras(r = {}) {
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);
  const medidas = r.medidas && (n(r.medidas.C) || n(r.medidas.L) || n(r.medidas.A)) ? { C: n(r.medidas.C), L: n(r.medidas.L), A: n(r.medidas.A) } : null;
  if (medidas && !(medidas.C && medidas.L && medidas.A)) throw new Error("Medidas à mão precisam de comprimento, largura e altura (mm).");
  const out = { embalagem: opcao(EMBALAGEM, r.embalagem), juntoCom: String(r.juntoCom || "").trim().slice(0, 40), posicao: opcao(POSICAO, r.posicao), orientacao: opcao(ORIENTACAO, r.orientacao), medidas, observacao: String(r.observacao || "").trim().slice(0, 200) };
  return Object.values(out).some((v) => v) ? out : null;
}

/** Texto curto de uma regra, para chips e para o PDF. */
export function resumoDaRegra(r) {
  if (!r) return "";
  const rot = (lista, v) => (lista.find(([k]) => k === v) || [])[1];
  return [r.embalagem && rot(EMBALAGEM, r.embalagem), r.juntoCom && `junto com "${r.juntoCom}"`, r.posicao && rot(POSICAO, r.posicao), r.orientacao && rot(ORIENTACAO, r.orientacao), r.medidas && `${r.medidas.C}×${r.medidas.L}×${r.medidas.A} mm`].filter(Boolean).join(" · ");
}

/** Regra da marca (maiúscula) num mapa { marca: regras }. */
export const regraDe = (ajustes, marca) => (ajustes && ajustes[String(marca || "").toUpperCase()]) || null;
