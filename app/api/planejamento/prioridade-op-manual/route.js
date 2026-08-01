// OPs fixadas manualmente na TV de Prioridades por setor (as rápidas, que não abrem
// cronograma). GET lista as fixadas + as disponíveis (têm peças, sem cronograma ativo);
// POST fixa; DELETE remove.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP"];

export async function GET() {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const [fixadasRaw, cronos, grp] = await Promise.all([
    prisma.prioridadeTvOp.findMany({ orderBy: { createdAt: "desc" }, select: { opNumero: true, opId: true } }),
    prisma.cronograma.findMany({ where: { ativo: true }, select: { op: { select: { id: true } } } }),
    prisma.pecaConjunto.groupBy({ by: ["opId"], where: { opId: { not: null } }, _count: { _all: true } }),
  ]);

  const cronoIds = new Set(cronos.map((c) => c.op?.id).filter(Boolean));
  const opIdsComPecas = grp.map((g) => g.opId).filter(Boolean);
  const ops = await prisma.oP.findMany({
    where: { id: { in: opIdsComPecas } },
    select: { id: true, numero: true, obra: true, cliente: true, status: true },
  });

  const pinnedNums = new Set(fixadasRaw.map((f) => f.opNumero));
  const pinnedIds = new Set(fixadasRaw.map((f) => f.opId).filter(Boolean));
  const infoById = new Map(ops.map((o) => [o.id, o]));
  const infoByNum = new Map(ops.map((o) => [o.numero, o]));

  const disponiveis = ops
    .filter((o) => !cronoIds.has(o.id) && !pinnedIds.has(o.id) && !pinnedNums.has(o.numero) && o.status !== "CANCELADA")
    .map((o) => ({ opId: o.id, opNumero: o.numero, obra: o.obra || null, cliente: o.cliente || null }))
    .sort((a, b) => String(b.opNumero).localeCompare(String(a.opNumero), "pt-BR", { numeric: true }));

  const fixadas = fixadasRaw.map((f) => {
    const o = (f.opId && infoById.get(f.opId)) || infoByNum.get(f.opNumero);
    return { opNumero: f.opNumero, obra: o?.obra || null, cliente: o?.cliente || null, temPecas: !!o };
  });

  return NextResponse.json({ fixadas, disponiveis });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opId, opNumero } = await req.json().catch(() => ({}));
  if (!opNumero) return NextResponse.json({ error: "opNumero obrigatório" }, { status: 400 });

  await prisma.prioridadeTvOp.upsert({
    where: { opNumero },
    update: { opId: opId || null },
    create: { opNumero, opId: opId || null, criadoPorId: user.id },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = new URL(req.url).searchParams.get("opNumero");
  if (!opNumero) return NextResponse.json({ error: "opNumero obrigatório" }, { status: 400 });
  await prisma.prioridadeTvOp.deleteMany({ where: { opNumero } });
  return NextResponse.json({ ok: true });
}
