// Rateio do custo de TRANSFORMAÇÃO por OP.
//
// Modelo (validado com o Vitor, jul/2026): o custo de fabricação da Torg é o
// custo OPERACIONAL do mês (folha + terceiros + utilidades + ocupação +
// manutenção + ADM) rateado por kg-op produzido. Material é DIRETO (verba) e
// fica de fora; financeiro (juros/factoring/empréstimo) e investimento (capex)
// também ficam de fora do custo das obras.
//
// A classificação é pelo PLANO DE CONTAS do Omie (prefixo da categoria), não
// por "tem projeto ou não" — porque material sem projeto e despesa financeira
// contaminavam o pool. Ver ContaPagar.categoriaNome ("3.1 - Compras...", etc.).
//
// ⚠ JANELA: o Syneco só passou a capturar a fábrica inteira em 2026. Antes
// disso há meses com 0-2 OPs apontadas e overhead cheio → R$/kg-op explodia
// (out/2025 = R$68/kg). Por isso o rateio só vale de 2026-01 em diante; obras
// com produção em 2025 têm esse custo marcado como incompleto (shareForaJanela).
import { prisma } from "@/lib/prisma";

export const JANELA_INICIO = "2026-01";
const janelaData = () => new Date(JANELA_INICIO + "-01T00:00:00-03:00");

// Grupo do plano de contas a partir do prefixo numérico da categoria Omie.
export function grupoConta(categoriaNome) {
  const s = categoriaNome || "";
  if (s.startsWith("4.4")) return "frete"; // Frete de entrega — logística
  const t = s.match(/^(\d+)/)?.[1];
  if (t === "3") return "material"; // compras (direto por OP)
  if (["4", "5", "6", "7", "8", "10", "11", "12", "13", "14", "15"].includes(t)) return "transformacao"; // operacional
  if (["16", "20"].includes(t)) return "financeiro"; // juros, factoring, empréstimo, IOF
  if (t === "21") return "investimento"; // capex
  if (t === "2") return "parcelamento";
  return "outros";
}

// Chave AAAA-MM no fuso BRT (−3).
function chaveMes(dt) {
  const d = new Date(dt.getTime() - 3 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Série mensal { mes: { totalKg, pool, rkg } } na janela válida. Cache 5 min —
// é a mesma pra todas as OPs, então não recalcula a cada card.
let _cache = { data: null, ts: 0 };
export async function getSerieRateio({ force = false } = {}) {
  if (!force && _cache.data && Date.now() - _cache.ts < 300_000) return _cache.data;
  const ini = janelaData();
  const [apts, contas] = await Promise.all([
    prisma.mesApontamento.findMany({ where: { dataInicio: { gte: ini }, opId: { not: null } }, select: { dataInicio: true, produzidoKg: true } }),
    prisma.contaPagar.findMany({ where: { dataVencimento: { gte: ini } }, select: { dataVencimento: true, categoriaNome: true, valor: true } }),
  ]);
  const totalKg = {}, pool = {};
  for (const a of apts) { const m = chaveMes(a.dataInicio); totalKg[m] = (totalKg[m] || 0) + (a.produzidoKg || 0); }
  for (const c of contas) { if (grupoConta(c.categoriaNome) !== "transformacao") continue; const m = chaveMes(c.dataVencimento); pool[m] = (pool[m] || 0) + (c.valor || 0); }
  const serie = {};
  for (const m of new Set([...Object.keys(totalKg), ...Object.keys(pool)])) {
    const tk = totalKg[m] || 0, pl = pool[m] || 0;
    serie[m] = { totalKg: tk, pool: pl, rkg: tk ? pl / tk : 0 };
  }
  _cache = { data: serie, ts: Date.now() };
  return serie;
}

// Custo de transformação acumulado da OP = Σ (kg-op do mês × R$/kg-op do mês).
export async function custoTransformacaoOP(opId, serie) {
  const s = serie || (await getSerieRateio());
  const ini = janelaData();
  const apts = await prisma.mesApontamento.findMany({ where: { opId }, select: { dataInicio: true, produzidoKg: true } });
  const porMes = {};
  let kgForaJanela = 0;
  for (const a of apts) {
    if (a.dataInicio < ini) { kgForaJanela += a.produzidoKg || 0; continue; }
    const m = chaveMes(a.dataInicio);
    porMes[m] = (porMes[m] || 0) + (a.produzidoKg || 0);
  }
  let total = 0, kgTotal = 0;
  const detalhe = [];
  for (const m of Object.keys(porMes).sort()) {
    const rkg = s[m]?.rkg || 0;
    const custo = porMes[m] * rkg;
    total += custo;
    kgTotal += porMes[m];
    detalhe.push({ mes: m, kgOp: porMes[m], rkg, custo });
  }
  const shareForaJanela = kgForaJanela + kgTotal > 0 ? kgForaJanela / (kgForaJanela + kgTotal) : 0;
  return { total, kgTotal, kgForaJanela, shareForaJanela, detalhe };
}
