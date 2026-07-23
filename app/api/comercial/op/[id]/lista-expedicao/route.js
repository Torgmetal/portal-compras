// GET  — Lista(s) de Expedição da OP (importadas da pasta do servidor) + as
//        revisões PENDENTES, já cruzadas com as peças alocadas nos lotes:
//        excluída que ainda está num lote = risco de expedir peça que não existe.
// POST  — puxa/atualiza da pasta do servidor (SharePoint) e registra o diff.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { importarListasOP } from "@/lib/lista-avancada-sharepoint";

export const runtime = "nodejs";
export const maxDuration = 120;
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const k = (s) => String(s || "").trim().toUpperCase();

async function montar(opId, opNumero) {
  const where = { OR: [{ opId }, { opNumero: String(opNumero) }] };
  const [listas, revisoes, pecas] = await Promise.all([
    prisma.listaExpedicao.findMany({
      where, orderBy: { frente: "asc" },
      select: { id: true, frente: true, arquivo: true, revisao: true, marcas: true, qtdItens: true, pesoContratado: true, pesoExpedido: true, pesoFaltante: true, importadoEm: true, fileModificado: true },
    }),
    prisma.listaExpedicaoRevisao.findMany({ where: { AND: [where, { resolvidaEm: null }] }, orderBy: { detectadaEm: "desc" }, take: 20 }),
    prisma.pecaLote.findMany({ where: { opId }, select: { marca: true, loteId: true, lote: { select: { nome: true } } } }),
  ]);

  const porMarca = new Map();
  for (const p of pecas) if (!porMarca.has(k(p.marca))) porMarca.set(k(p.marca), p);
  const anota = (arr) => (Array.isArray(arr) ? arr : []).map((m) => ({ ...m, lote: porMarca.get(k(m.marca))?.lote?.nome || null }));

  const pendentes = revisoes.map((r) => {
    const excluidas = anota(r.excluidas);
    const incluidas = anota(r.incluidas);
    return {
      ...r, excluidas, incluidas, alteradas: anota(r.alteradas),
      // o risco que o Vitor citou: peça saiu da lista mas segue alocada num lote
      excluidasAlocadas: excluidas.filter((m) => m.lote).length,
      incluidasSemLote: incluidas.filter((m) => !m.lote).length,
    };
  });
  return { listas, pendentes };
}

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  return NextResponse.json({ success: true, ...(await montar(op.id, op.numero)) });
}

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  let r;
  try { r = await importarListasOP({ opNumero: op.numero, opId: op.id, userId: user.id }); }
  catch (e) { return NextResponse.json({ error: "Falha ao ler a pasta do servidor: " + (e?.message || "") }, { status: 502 }); }
  if (!r.ok) return NextResponse.json({ error: r.erro || "Não foi possível importar." }, { status: 404 });

  await prisma.auditLog.create({ data: { userId: user.id, action: "ATUALIZAR_LISTA_EXPEDICAO", entity: "OP", entityId: op.id, diff: { resultados: r.resultados?.map((x) => ({ frente: x.frente, ok: x.ok, revisao: x.revisao, mudanca: x.mudanca || null })) } } }).catch(() => {});
  return NextResponse.json({ success: true, resultados: r.resultados, ...(await montar(op.id, op.numero)) });
}
