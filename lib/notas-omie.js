// ─── O NÚMERO DA NOTA DE CADA PARCELA FATURADA ────────────────────────────────
// O cache diário (lib/faturamento-cache) sabe que a parcela foi faturada, mas não o número da NF.
// Ele vem de ConsultarNF pelo código do pedido da parcela (lib/omie-nfe), uma vez, e fica em
// `NotaFiscalOmie`. Vitor (16/09/2026): "precisa informar o número da NF".
//
// ⚠ POUCAS CONSULTAS POR VEZ. O Omie bloqueia rajadas ("consultas repetidas"); por chamada da tela
// consultamos no máximo `MAX_POR_VEZ` parcelas novas, em sequência, e o resto fica para a próxima
// abertura (ou para o cron). Parcela consultada sem NF é reconsultada só depois de um dia.
import "server-only";
import { prisma } from "./prisma";
import { consultarNFePorPedido } from "./omie-nfe";

const MAX_POR_VEZ = 12;
const UM_DIA = 24 * 3600 * 1000;
const dataBR = (s) => { const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`) : null; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {Array<{codigoPedido:string|number, numero?:string}>} parcelas parcelas FATURADAS do cache
 * @returns {Promise<Map<string, {numero:string|null, serie:string|null, chave:string|null, dataEmissao:string|null}>>} por codigoPedido
 */
export async function notasDasParcelas(parcelas) {
  const codigos = [...new Set((parcelas || []).map((p) => String(p?.codigoPedido || "")).filter(Boolean))];
  const out = new Map();
  if (!codigos.length) return out;
  const guardadas = await prisma.notaFiscalOmie.findMany({ where: { codigoPedido: { in: codigos } } }).catch(() => []);
  const porCodigo = new Map(guardadas.map((n) => [n.codigoPedido, n]));
  const agora = Date.now();
  let consultas = 0;
  for (const cod of codigos) {
    const g = porCodigo.get(cod);
    const fresca = g && (g.numero || agora - new Date(g.consultadoEm).getTime() < UM_DIA);
    if (fresca) { out.set(cod, { numero: g.numero, serie: g.serie, chave: g.chave, dataEmissao: g.dataEmissao ? g.dataEmissao.toISOString().slice(0, 10) : null }); continue; }
    if (consultas >= MAX_POR_VEZ) { if (g) out.set(cod, { numero: g.numero, serie: g.serie, chave: g.chave, dataEmissao: null }); continue; }
    consultas++;
    if (consultas > 1) await dormir(300);
    const r = await consultarNFePorPedido(cod).catch((e) => ({ error: e.message }));
    const nf = r?.nf || null;
    const numeroPedido = (parcelas.find((p) => String(p.codigoPedido) === cod) || {}).numero || null;
    const dados = { numeroPedido: numeroPedido ? String(numeroPedido) : null, numero: nf?.numero || null, serie: nf?.serie || null, chave: nf?.chave || null, dataEmissao: dataBR(nf?.dataEmissao), consultadoEm: new Date(), erro: r?.error ? String(r.error).slice(0, 300) : null };
    await prisma.notaFiscalOmie.upsert({ where: { codigoPedido: cod }, create: { codigoPedido: cod, ...dados }, update: dados }).catch(() => {});
    if (nf) out.set(cod, { numero: nf.numero, serie: nf.serie, chave: nf.chave, dataEmissao: dados.dataEmissao ? dados.dataEmissao.toISOString().slice(0, 10) : null });
  }
  return out;
}
