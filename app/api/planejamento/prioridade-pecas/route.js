// Marcação de PEÇAS prioritárias (Planejamento). A prioridade é da PEÇA (vale na obra
// toda, em todo setor por onde ela passa) e fica em PecaConjunto.prioridade — um número
// crescente que também dá a ordem de prioridade. A TV de Prioridades por setor lê isso.
//
// GET            -> lista de OPs (cronogramas ativos) + quantas peças já estão marcadas
// GET ?opId=..   -> peças da OP (conjuntos + avulsas) com o estado de prioridade
// PATCH          -> marca/desmarca uma peça; ao marcar, checa se já não estava marcada
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");

  if (opId) {
    const pecas = await prisma.pecaConjunto.findMany({
      where: { opId, tipoPeca: { not: "CROQUI" } },
      select: { id: true, marca: true, tipoPeca: true, pesoTotalKg: true, prioridade: true, status: true },
    });
    // marcadas primeiro (por prioridade), depois o resto por marca
    pecas.sort((a, b) => {
      const pa = a.prioridade != null, pb = b.prioridade != null;
      if (pa !== pb) return pb - pa;
      if (pa && pb && a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
      return String(a.marca).localeCompare(String(b.marca));
    });
    return NextResponse.json({ pecas });
  }

  // Lista de OPs dos cronogramas ativos + contagem de prioritárias.
  const cronos = await prisma.cronograma.findMany({
    where: { ativo: true },
    select: { opNumero: true, titulo: true, op: { select: { id: true, numero: true, obra: true, cliente: true } } },
  });
  const obras = [];
  const opIds = [];
  for (const c of cronos) {
    if (!c.op?.id) continue;
    obras.push({ opId: c.op.id, opNumero: c.op.numero || c.opNumero, obra: c.op.obra || c.titulo || c.opNumero, cliente: c.op.cliente || null, nMarcadas: 0 });
    opIds.push(c.op.id);
  }
  if (opIds.length) {
    const grp = await prisma.pecaConjunto.groupBy({ by: ["opId"], where: { opId: { in: opIds }, prioridade: { not: null } }, _count: { _all: true } });
    const porOp = new Map(grp.map((g) => [g.opId, g._count._all]));
    for (const o of obras) o.nMarcadas = porOp.get(o.opId) || 0;
  }
  obras.sort((a, b) => String(a.opNumero).localeCompare(String(b.opNumero), "pt-BR", { numeric: true }));
  return NextResponse.json({ obras });
}

export async function PATCH(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { pecaId, marcar } = await req.json().catch(() => ({}));
  if (!pecaId) return NextResponse.json({ error: "pecaId obrigatório" }, { status: 400 });

  const peca = await prisma.pecaConjunto.findUnique({ where: { id: pecaId }, select: { id: true, opId: true, marca: true, prioridade: true } });
  if (!peca) return NextResponse.json({ error: "Peça não encontrada" }, { status: 404 });

  if (marcar) {
    // Sempre checa se já não estava marcada antes de marcar de novo.
    if (peca.prioridade != null) {
      return NextResponse.json({ jaMarcada: true, peca: { id: peca.id, prioridade: peca.prioridade } });
    }
    const max = await prisma.pecaConjunto.aggregate({ where: { opId: peca.opId, prioridade: { not: null } }, _max: { prioridade: true } });
    const nova = (max._max.prioridade || 0) + 1;
    const upd = await prisma.pecaConjunto.update({ where: { id: pecaId }, data: { prioridade: nova }, select: { id: true, prioridade: true } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "MARCAR_PRIORIDADE", entity: "PecaConjunto", entityId: pecaId, diff: { marca: peca.marca, prioridade: nova } } }).catch(() => {});
    return NextResponse.json({ peca: upd });
  }

  await prisma.pecaConjunto.update({ where: { id: pecaId }, data: { prioridade: null } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DESMARCAR_PRIORIDADE", entity: "PecaConjunto", entityId: pecaId, diff: { marca: peca.marca } } }).catch(() => {});
  return NextResponse.json({ peca: { id: pecaId, prioridade: null } });
}
