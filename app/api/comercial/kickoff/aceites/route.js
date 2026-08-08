// GET /api/comercial/kickoff/aceites — histórico de aceites do Kick Off por OP:
// quem já confirmou e quem falta (GERAL e FISCAL), pra saber quais obras ainda
// não fecharam a divulgação. Acesso ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const aceites = await prisma.kickoffAceite.findMany({
    select: {
      tipo: true, email: true, enviadoEm: true, aceitoEm: true,
      kickoff: { select: { opId: true, enviadoEm: true, op: { select: { numero: true, cliente: true, obra: true } } } },
    },
    orderBy: { enviadoEm: "asc" },
  });

  const hoje = Date.now();
  const dias = (d) => (d ? Math.floor((hoje - new Date(d).getTime()) / 86400000) : null);

  const porOp = new Map();
  for (const a of aceites) {
    const op = a.kickoff?.op;
    if (!op || !a.kickoff?.opId) continue;
    const key = a.kickoff.opId;
    if (!porOp.has(key)) porOp.set(key, {
      opId: key, numero: op.numero, cliente: op.cliente, obra: op.obra || null,
      divulgadoEm: a.kickoff.enviadoEm, geral: { pend: 0, ok: 0 }, fiscal: { pend: 0, ok: 0 },
      pendentes: [], confirmados: [],
    });
    const o = porOp.get(key);
    const t = a.tipo === "FISCAL" ? "FISCAL" : "GERAL";
    const bucket = t === "FISCAL" ? o.fiscal : o.geral;
    if (a.aceitoEm) { bucket.ok++; o.confirmados.push({ email: a.email, tipo: t, aceitoEm: a.aceitoEm, dias: dias(a.aceitoEm) }); }
    else { bucket.pend++; o.pendentes.push({ email: a.email, tipo: t, enviadoEm: a.enviadoEm, dias: dias(a.enviadoEm) }); }
  }

  const ops = [...porOp.values()].map((o) => ({
    ...o,
    totalPend: o.geral.pend + o.fiscal.pend,
    totalOk: o.geral.ok + o.fiscal.ok,
    maxDias: o.pendentes.length ? Math.max(...o.pendentes.map((p) => p.dias ?? 0)) : null,
  }));
  // urgência: obras com pendência primeiro (mais antiga no topo), depois as 100% confirmadas
  ops.sort((a, b) => {
    if ((b.totalPend > 0) !== (a.totalPend > 0)) return (b.totalPend > 0) - (a.totalPend > 0);
    if (a.totalPend > 0) return (b.maxDias ?? 0) - (a.maxDias ?? 0);
    return String(a.numero).localeCompare(String(b.numero));
  });

  const comPendencia = ops.filter((o) => o.totalPend > 0);
  const resumo = {
    obrasComPendencia: comPendencia.length,
    totalPendencias: ops.reduce((s, o) => s + o.totalPend, 0),
    totalConfirmados: ops.reduce((s, o) => s + o.totalOk, 0),
    obrasDivulgadas: ops.length,
  };

  return NextResponse.json({ resumo, ops, geradoEm: new Date().toISOString() });
}
