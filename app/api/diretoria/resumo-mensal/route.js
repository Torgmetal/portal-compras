// GET /api/diretoria/resumo-mensal
// Resumo mês a mês pra Diretoria avaliar que tipo de obra vale a pena vender:
//   - EXPEDIDO por OP no mês  (peso da LISTA de expedição — regra do Vitor)
//   - RECEITA por obra         (faturado do Omie via pedidos de venda; no mês,
//                               das medições faturadas OPMedicao.data)
//   - MATÉRIA-PRIMA por obra    (ContaPagar grupo material, projeto Omie → OP)
//   - TRANSFORMAÇÃO por obra    (custo operacional do mês × fatia de produção
//                               da obra; só 2026+, ver lib/rateio-transformacao)
//   - % do mês e MARGEM (receita − material − transformação) por obra
// Uma chamada ao Omie (listarPedidosVendaAbertos) traz o faturado por obra E a
// lista completa de projetos (mapa projeto→OP). Degrada gracioso se o Omie cair.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { grupoConta, JANELA_INICIO } from "@/lib/rateio-transformacao";
import { listarPedidosVendaAbertos } from "@/lib/omie-pedidos-abertos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesLabel = (chave) => { const [a, m] = chave.split("-"); return `${MESES_PT[Number(m) - 1]}/${a}`; };
const mesKeyDate = (dt) => { const d = new Date(dt.getTime() - 3 * 3600 * 1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const numKey = (n) => { const i = parseInt(n, 10); return Number.isNaN(i) ? null : i; };
const opDoNome = (nome) => { const m = String(nome || "").match(/OP[-\s]*0*(\d+)/i); return m ? parseInt(m[1], 10) : null; };
const INICIO = "2025-10"; // primeiro mês com expedido registrado

export async function GET() {
  try { await requireDiretoria(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Forbidden" ? 403 : 401 }); }
  const ini = new Date(INICIO + "-01T00:00:00-03:00");
  const janela = new Date(JANELA_INICIO + "-01T00:00:00-03:00");
  // Teto contra datas-lixo do Omie (venc. "4202-..."); e mês atual pra cortar futuro.
  const fim = new Date(`${new Date().getUTCFullYear() + 2}-01-01T00:00:00-03:00`);
  const agoraBRT = new Date(Date.now() - 3 * 3600 * 1000);
  const mesAtual = `${agoraBRT.getUTCFullYear()}-${String(agoraBRT.getUTCMonth() + 1).padStart(2, "0")}`;

  const [medicoes, contas, contasReceber, listas, apts, ops, venda] = await Promise.all([
    prisma.oPMedicao.findMany({ where: { data: { gte: ini, lt: fim } }, select: { opId: true, data: true, valorBruto: true, etapa: true, status: true } }),
    prisma.contaPagar.findMany({ where: { dataVencimento: { gte: ini, lt: fim } }, select: { dataVencimento: true, categoriaNome: true, valor: true, valorPago: true, status: true, projetoCodigo: true } }),
    prisma.contaReceber.findMany({ where: { dataEmissao: { gte: ini, lt: fim } }, select: { dataEmissao: true, valor: true, valorRecebido: true, status: true } }),
    prisma.listaExpedicao.findMany({ select: { opId: true, opNumero: true, marcasJson: true } }),
    prisma.mesApontamento.findMany({ where: { dataInicio: { gte: janela }, opId: { not: null } }, select: { opId: true, dataInicio: true, produzidoKg: true } }),
    prisma.oP.findMany({ select: { id: true, numero: true, obra: true } }),
    listarPedidosVendaAbertos().catch(() => null),
  ]);

  const opById = new Map(ops.map((o) => [o.id, o]));
  const opByNum = new Map(); for (const o of ops) { const k = numKey(o.numero); if (k != null && !opByNum.has(k)) opByNum.set(k, o); }
  // Faturado por OP (Omie) + mapa projeto→OP (lista completa de projetos do Omie)
  const faturadoPorOp = new Map(); const projToOp = new Map();
  if (venda?.obras) for (const o of venda.obras) { const k = numKey(o.numeroOp); if (k != null) faturadoPorOp.set(k, (faturadoPorOp.get(k) || 0) + (o.faturado || 0)); }
  if (venda?.projetos) for (const pr of venda.projetos) { const num = numKey(opDoNome(pr.nome)); if (num != null && opByNum.has(num)) projToOp.set(String(pr.codProj), opByNum.get(num)); }

  // fatia de produção por OP por mês (kg-op) — só janela válida (2026+)
  const totalKgMes = {}, opKgMes = new Map(), kg2025 = new Map();
  for (const a of apts) { const m = mesKeyDate(a.dataInicio); totalKgMes[m] = (totalKgMes[m] || 0) + (a.produzidoKg || 0); const bag = opKgMes.get(a.opId) || (opKgMes.set(a.opId, {}), opKgMes.get(a.opId)); bag[m] = (bag[m] || 0) + (a.produzidoKg || 0); }
  for (const a of await prisma.mesApontamento.findMany({ where: { dataInicio: { lt: janela }, opId: { not: null } }, select: { opId: true, produzidoKg: true } })) kg2025.set(a.opId, (kg2025.get(a.opId) || 0) + (a.produzidoKg || 0));

  const meses = new Map();
  const getMes = (chave) => { if (!meses.has(chave)) meses.set(chave, { chave, label: mesLabel(chave), custoTransf: 0, materialTotal: 0, materialAlocado: 0, receitaTotal: 0, expedidoTotal: 0, aReceber: 0, recebido: 0, aPagar: 0, pago: 0, ops: new Map() }); return meses.get(chave); };
  const getOp = (mes, op) => { if (!mes.ops.has(op.id)) mes.ops.set(op.id, { numero: op.numero, obra: op.obra || "", expedidoKg: 0, receita: 0, material: 0, transformacao: 0, share: 0 }); return mes.ops.get(op.id); };

  // 1) A pagar / pago (TODAS as contas do mês) + custo do mês + matéria-prima por obra
  for (const c of contas) {
    const mes = getMes(mesKeyDate(c.dataVencimento));
    if (c.status !== "CANCELADO") { mes.aPagar += c.valor || 0; mes.pago += c.valorPago || 0; }
    const g = grupoConta(c.categoriaNome);
    if (g !== "transformacao" && g !== "material") continue;
    const valor = c.valor || 0;
    if (g === "transformacao") { mes.custoTransf += valor; continue; }
    mes.materialTotal += valor;
    const op = c.projetoCodigo ? projToOp.get(String(c.projetoCodigo)) : null;
    if (op) { mes.materialAlocado += valor; getOp(mes, op).material += valor; }
  }
  // 1b) A receber (faturado) / recebido do mês — total da empresa (ContaReceber por emissão)
  for (const c of contasReceber) { if (!c.dataEmissao || c.status === "CANCELADO") continue; const mes = getMes(mesKeyDate(c.dataEmissao)); mes.aReceber += c.valor || 0; mes.recebido += c.valorRecebido || 0; }
  // 2) Receita GERADA por obra no mês = só medições FATURADAS (etapa 60).
  // As "a faturar" (etapa 10/20, romaneios futuros) são saldo, não receita.
  const naoFaturada = (m) => m.etapa === "10" || m.etapa === "20" || /n[ãa]o faturad/i.test(m.status || "");
  for (const m of medicoes) { if (!m.data || naoFaturada(m)) continue; const op = opById.get(m.opId); if (!op) continue; const mes = getMes(mesKeyDate(m.data)); const v = m.valorBruto || 0; mes.receitaTotal += v; getOp(mes, op).receita += v; }
  // 3) Expedido por obra (peso da lista, dedup por OP+marca)
  const vistas = new Set();
  for (const l of listas) {
    const op = l.opId ? opById.get(l.opId) : (numKey(l.opNumero) != null ? opByNum.get(numKey(l.opNumero)) : null);
    if (!op) continue;
    for (const mk of Array.isArray(l.marcasJson) ? l.marcasJson : []) {
      if (!mk.expedidoRomaneio || !mk.dataExpedicao) continue;
      const marca = String(mk.marca || "").trim().toUpperCase(); const dk = `${op.id}|${marca}`;
      if (!marca || vistas.has(dk)) continue; vistas.add(dk);
      const chave = String(mk.dataExpedicao).slice(0, 7); if (!/^\d{4}-\d{2}$/.test(chave)) continue;
      const mes = getMes(chave); const peso = mk.pesoTotal || 0; mes.expedidoTotal += peso; getOp(mes, op).expedidoKg += peso;
    }
  }
  // 4) Transformação por obra no mês (só 2026+): fatia de produção × pool do mês
  for (const [opId, porMes] of opKgMes) {
    const op = opById.get(opId); if (!op) continue;
    for (const [m, kg] of Object.entries(porMes)) {
      if (m < JANELA_INICIO) continue;
      const tot = totalKgMes[m] || 0; if (!tot) continue;
      const mes = meses.get(m); if (!mes) continue;
      const share = kg / tot;
      const linha = getOp(mes, op);
      linha.share = share; linha.transformacao = share * mes.custoTransf;
    }
  }

  // Monta meses (recente primeiro), cortando lixo e futuro
  const mesesOut = [...meses.values()]
    .filter((mes) => mes.chave >= INICIO && mes.chave <= mesAtual)
    .sort((a, b) => b.chave.localeCompare(a.chave))
    .map((mes) => ({
      chave: mes.chave, label: mes.label,
      custoTransf: mes.custoTransf, materialTotal: mes.materialTotal,
      materialNaoAlocado: mes.materialTotal - mes.materialAlocado,
      custoTotal: mes.custoTransf + mes.materialTotal,
      receitaTotal: mes.receitaTotal, expedidoTotal: mes.expedidoTotal,
      aReceber: mes.aReceber, recebido: mes.recebido, aPagar: mes.aPagar, pago: mes.pago,
      resultado: mes.aReceber - mes.aPagar, resultadoCaixa: mes.recebido - mes.pago,
      ops: [...mes.ops.values()].map((o) => ({ ...o, margem: o.receita > 0 ? o.receita - o.material - o.transformacao : null })).sort((a, b) => b.expedidoKg - a.expedidoKg || b.receita - a.receita),
    }));

  // Ranking de obras (acumulado): faturado Omie × custo (material + transformação 2026+)
  const rk = new Map();
  for (const mes of mesesOut) for (const o of mes.ops) {
    if (!rk.has(o.numero)) rk.set(o.numero, { numero: o.numero, obra: o.obra, expedidoKg: 0, receitaMed: 0, material: 0, transformacao: 0 });
    const r = rk.get(o.numero); r.expedidoKg += o.expedidoKg; r.receitaMed += o.receita; r.material += o.material; r.transformacao += o.transformacao; if (!r.obra && o.obra) r.obra = o.obra;
  }
  const ranking = [...rk.values()].map((r) => {
    const op = opByNum.get(numKey(r.numero));
    const fatOmie = op ? faturadoPorOp.get(numKey(r.numero)) : null;
    const receita = fatOmie != null && fatOmie > 0 ? fatOmie : r.receitaMed;
    const custoTotal = r.material + r.transformacao;
    const margem = receita > 0 ? receita - custoTotal : null;
    const incompleto2025 = op ? (kg2025.get(op.id) || 0) > 1000 : false;
    return { numero: r.numero, obra: r.obra, expedidoKg: r.expedidoKg, receita, receitaOmie: fatOmie != null && fatOmie > 0, material: r.material, transformacao: r.transformacao, custoTotal, margem, margemPct: margem != null && receita > 0 ? (margem / receita) * 100 : null, incompleto2025 };
  }).sort((a, b) => (b.margem ?? -Infinity) - (a.margem ?? -Infinity) || b.expedidoKg - a.expedidoKg);

  return NextResponse.json({ meses: mesesOut, ranking, omieOk: !!venda });
}
