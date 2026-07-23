// GET /api/diretoria/resumo-mensal
// Resumo mês a mês pra Diretoria avaliar qual obra vale a pena:
//   - EXPEDIDO por OP no mês  (peso da LISTA de expedição — regra do Vitor)
//   - RECEITA gerada por obra  (medições faturadas, OPMedicao.data)
//   - MATÉRIA-PRIMA por obra    (ContaPagar grupo material, projeto→OP)
//   - CUSTO do mês              (matéria-prima + custo operacional/transformação)
// Custo vem do plano de contas (lib/rateio-transformacao.grupoConta). Material
// sem projeto vinculado não entra por obra (aparece como "não alocado").
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { grupoConta } from "@/lib/rateio-transformacao";
import { getProjetosInfo } from "@/lib/omie-pedidos-abertos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesLabel = (chave) => { const [a, m] = chave.split("-"); return `${MESES_PT[Number(m) - 1]}/${a}`; };
const mesKeyDate = (dt) => { const d = new Date(dt.getTime() - 3 * 3600 * 1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const numKey = (n) => { const i = parseInt(n, 10); return Number.isNaN(i) ? null : i; };
const INICIO = "2025-10"; // primeiro mês com expedido registrado

export async function GET() {
  try { await requireDiretoria(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Forbidden" ? 403 : 401 }); }
  const ini = new Date(INICIO + "-01T00:00:00-03:00");
  // Teto contra datas-lixo do Omie (ex.: vencimento "4202-07-20"). Mantém as
  // medições agendadas dos próximos meses, corta o lixo de anos absurdos.
  const fim = new Date(`${new Date().getUTCFullYear() + 2}-01-01T00:00:00-03:00`);
  const agoraBRT = new Date(Date.now() - 3 * 3600 * 1000);
  const mesAtual = `${agoraBRT.getUTCFullYear()}-${String(agoraBRT.getUTCMonth() + 1).padStart(2, "0")}`;

  const [medicoes, contas, listas, projetos, ops] = await Promise.all([
    prisma.oPMedicao.findMany({ where: { data: { gte: ini, lt: fim } }, select: { opId: true, data: true, valorBruto: true } }),
    prisma.contaPagar.findMany({ where: { dataVencimento: { gte: ini, lt: fim } }, select: { dataVencimento: true, categoriaNome: true, valor: true, projetoCodigo: true } }),
    prisma.listaExpedicao.findMany({ select: { opId: true, opNumero: true, marcasJson: true } }),
    getProjetosInfo().catch(() => new Map()),
    prisma.oP.findMany({ select: { id: true, numero: true, obra: true } }),
  ]);

  const opById = new Map(ops.map((o) => [o.id, o]));
  const opByNum = new Map(); for (const o of ops) { const k = numKey(o.numero); if (k != null && !opByNum.has(k)) opByNum.set(k, o); }
  // projetoCodigo (string) → OP, via nome do projeto Omie ("OP-083 ...")
  const projToOp = new Map();
  for (const [cod, info] of projetos) { const k = numKey(info?.numeroOp); if (k != null && opByNum.has(k)) projToOp.set(String(cod), opByNum.get(k)); }

  // meses[chave] = { custoTransf, materialTotal, materialAlocado, receitaTotal, expedidoTotal, ops: Map(opId → {obra, numero, expedidoKg, receita, material}) }
  const meses = new Map();
  const getMes = (chave) => {
    if (!meses.has(chave)) meses.set(chave, { chave, label: mesLabel(chave), custoTransf: 0, materialTotal: 0, materialAlocado: 0, receitaTotal: 0, expedidoTotal: 0, ops: new Map() });
    return meses.get(chave);
  };
  const getOpNoMes = (mes, op) => {
    if (!mes.ops.has(op.id)) mes.ops.set(op.id, { numero: op.numero, obra: op.obra || "", expedidoKg: 0, receita: 0, material: 0 });
    return mes.ops.get(op.id);
  };

  // 1) Custo do mês (contas classificadas) + matéria-prima por obra
  for (const c of contas) {
    const g = grupoConta(c.categoriaNome);
    if (g !== "transformacao" && g !== "material") continue;
    const chave = mesKeyDate(c.dataVencimento);
    const mes = getMes(chave);
    const valor = c.valor || 0;
    if (g === "transformacao") { mes.custoTransf += valor; continue; }
    // material
    mes.materialTotal += valor;
    const op = c.projetoCodigo ? projToOp.get(String(c.projetoCodigo)) : null;
    if (op) { mes.materialAlocado += valor; getOpNoMes(mes, op).material += valor; }
  }

  // 2) Receita gerada por obra (medições)
  for (const m of medicoes) {
    if (!m.data) continue;
    const op = opById.get(m.opId); if (!op) continue;
    const mes = getMes(mesKeyDate(m.data));
    const v = m.valorBruto || 0;
    mes.receitaTotal += v;
    getOpNoMes(mes, op).receita += v;
  }

  // 3) Expedido por obra (peso da lista, por dataExpedicao). Dedup por (OP+marca).
  const vistas = new Set();
  for (const l of listas) {
    const op = l.opId ? opById.get(l.opId) : (numKey(l.opNumero) != null ? opByNum.get(numKey(l.opNumero)) : null);
    if (!op) continue;
    for (const mk of Array.isArray(l.marcasJson) ? l.marcasJson : []) {
      if (!mk.expedidoRomaneio || !mk.dataExpedicao) continue;
      const marca = String(mk.marca || "").trim().toUpperCase();
      const dedup = `${op.id}|${marca}`;
      if (!marca || vistas.has(dedup)) continue;
      vistas.add(dedup);
      const chave = String(mk.dataExpedicao).slice(0, 7); // "2026-06"
      if (!/^\d{4}-\d{2}$/.test(chave)) continue;
      const mes = getMes(chave);
      const peso = mk.pesoTotal || 0;
      mes.expedidoTotal += peso;
      getOpNoMes(mes, op).expedidoKg += peso;
    }
  }

  const resultado = [...meses.values()]
    .filter((mes) => mes.chave >= INICIO && mes.chave <= mesAtual) // corta datas-lixo e meses futuros (receita gerada, não agendada)
    .sort((a, b) => b.chave.localeCompare(a.chave))
    .map((mes) => ({
      chave: mes.chave, label: mes.label,
      custoTransf: mes.custoTransf, materialTotal: mes.materialTotal, materialAlocado: mes.materialAlocado,
      materialNaoAlocado: mes.materialTotal - mes.materialAlocado,
      custoTotal: mes.custoTransf + mes.materialTotal,
      receitaTotal: mes.receitaTotal, expedidoTotal: mes.expedidoTotal,
      ops: [...mes.ops.values()].sort((a, b) => b.expedidoKg - a.expedidoKg || b.receita - a.receita),
    }));

  return NextResponse.json({ meses: resultado, omieOk: projetos.size > 0 });
}
