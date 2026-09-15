// ─── O R DE CADA LINHA DA LPC (portal do cliente) ─────────────────────────────
// Vitor (15/09/2026): "a LPC precisa sair as peças que são posições dos conjuntos e já informar a
// rastreabilidade de cada croqui (…) queria deixar essa parte como opcional, pois nem sempre vamos
// disponibilizar essas informações".
//
// ⚠⚠ OS MESMOS TRÊS CAMINHOS DO CARIMBO DO DESENHO, NA MESMA ORDEM ([[torg_r_tres_caminhos]]):
//   1. corte — a peça foi cortada daquele fardo (fato; `rastreioDaOp`)
//   2. amarração à mão — `TrocaRastreabilidade` do perfil (decisão registrada)
//   3. material da própria obra — `NA_OP` no CMR, FIFO (regra da casa)
// O cliente recebe o desenho carimbado e abre o portal: se os dois lessem o R por regras
// diferentes, a mesma peça apareceria com dois R — e é o portal que perderia a confiança.
//
// ⚠ SÓ PEÇA COM PERFIL LEVA R (croqui e avulsa). Conjunto é a soma dos croquis: o R dele são os R
// das posições, uma a uma, que já saem recuadas logo abaixo.
//
// ⚠ POR MARCA + PERFIL, não só por marca — a marca repete entre sub-obras com perfil diferente
// ([[torg_marca_nao_unica]]) e `rastreioDaPeca` já desempata assim.
import "server-only";
import { prisma } from "./prisma";
import { rastreioDaOp, rastreioDaPeca } from "./rastreio-peca";
import { amarracoesDaOp, amarracaoDoPerfil, rDoMaterialDaObra } from "./r-amarrado";
import { analisarMaterial } from "./material-liberacao";

const chaveDe = (marca, perfil) => `${String(marca || "").trim().toUpperCase()}|${String(perfil || "").trim().toUpperCase()}`;
// ⚠ "N/A", "-" e "sem corrida" no CMR são a nossa falta de dado, não uma corrida: para o cliente é
// vazio ([[torg_nao_declarar_furo]]) — e o R ao lado é o que ele precisa para cobrar o certificado.
const corridaLimpa = (c) => { const t = String(c ?? "").trim(); return !t || /^(n\/?a|-+|sem\b)/i.test(t) ? null : t; };

/**
 * Compõe o R de cada peça (pura — testável sem banco).
 * @param {Array<{marca:string, perfil?:string|null}>} pecas
 * @param {{ res?: object|null, amarradas?: Map, obra?: Map, cmrPorR?: Map }} fontes
 *   res      saída de rastreioDaOp (corte)
 *   amarradas saída de amarracoesDaOp (perfil → { r })
 *   obra     saída de rDoMaterialDaObra (perfil → { r })
 *   cmrPorR  R → { corrida, certificado } para completar o que a amarração e a obra não trazem
 * @returns {Map<string, {r:string, corrida:string|null, certificado:string|null, origem:"corte"|"amarracao"|"obra"}>} por `marca|perfil`
 */
export function comporRastreio(pecas, { res = null, amarradas = null, obra = null, cmrPorR = null } = {}) {
  const out = new Map();
  const completar = (r) => ({ corrida: corridaLimpa(cmrPorR?.get(r)?.corrida), certificado: cmrPorR?.get(r)?.certificado || null });
  for (const p of pecas || []) {
    const perfil = String(p?.perfil || "").trim();
    if (!perfil) continue;
    const k = chaveDe(p.marca, perfil);
    if (out.has(k)) continue;
    // 1. corte — fato
    const corte = rastreioDaPeca(res, p.marca, perfil);
    const usada = (corte?.usadas || []).find((u) => u?.rastreio);
    if (usada) { const r = String(usada.rastreio); out.set(k, { r, corrida: corridaLimpa(usada.corrida) || completar(r).corrida, certificado: usada.certificado || completar(r).certificado, origem: "corte" }); continue; }
    // 2. amarração à mão
    const am = amarracaoDoPerfil(amarradas, perfil);
    if (am?.r) { out.set(k, { r: am.r, ...completar(am.r), origem: "amarracao" }); continue; }
    // 3. material da obra
    const ob = amarracaoDoPerfil(obra, perfil);
    if (ob?.r) out.set(k, { r: ob.r, ...completar(ob.r), origem: "obra" });
  }
  return out;
}

/**
 * O R de cada linha com perfil de uma lista (a `pecasDaLista` do portal), pelos três caminhos.
 * @param {string} opNumero
 * @param {string} opId
 * @param {Array} pecas
 * @param {{ res?: object|null }} [opts] `res` = rastreioDaOp já calculado (a rota dos certificados usa o mesmo)
 */
export async function rastreioDaLpc(opNumero, opId, pecas, { res = null } = {}) {
  const comPerfil = (pecas || []).filter((p) => String(p?.perfil || "").trim());
  if (!comPerfil.length) return new Map();
  const perfis = [...new Set(comPerfil.map((p) => String(p.perfil).trim()))];
  const [rOp, amarradas, { porPerfil }] = await Promise.all([
    res ? Promise.resolve(res) : rastreioDaOp(opNumero, opId).catch(() => null),
    amarracoesDaOp(opNumero).catch(() => new Map()),
    analisarMaterial(opNumero, perfis.map((perfil, ix) => ({ id: `p${ix}`, perfil }))).catch(() => ({ porPerfil: new Map() })),
  ]);
  const obra = rDoMaterialDaObra(porPerfil);
  // corrida/certificado dos R que vieram só por perfil (a amarração e a obra guardam só o número)
  const rs = new Set();
  for (const v of amarradas.values()) if (v?.r) rs.add(String(v.r));
  for (const v of obra.values()) if (v?.r) rs.add(String(v.r));
  const cmr = rs.size
    ? await prisma.documentoQualidade.findMany({ where: { categoria: "MATERIAL", importRef: { in: [...rs] } }, select: { importRef: true, numeroCorrida: true, numeroDocumento: true } }).catch(() => [])
    : [];
  const cmrPorR = new Map(cmr.map((c) => [String(c.importRef), { corrida: c.numeroCorrida || null, certificado: c.numeroDocumento || null }]));
  return comporRastreio(comPerfil, { res: rOp, amarradas, obra, cmrPorR });
}

export const chaveRastreio = chaveDe;
