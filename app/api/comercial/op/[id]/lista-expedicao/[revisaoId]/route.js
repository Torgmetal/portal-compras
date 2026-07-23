// PATCH — marca a revisão como TRATADA (o Planejamento já alocou/retirou as
// peças nos lotes). Some da lista de pendências.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const rev = await prisma.listaExpedicaoRevisao.findUnique({ where: { id: params.revisaoId }, select: { id: true, opId: true } });
  if (!rev) return NextResponse.json({ error: "Revisão não encontrada" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const resolvida = body.resolvida !== false;
  const atualizada = await prisma.listaExpedicaoRevisao.update({
    where: { id: rev.id },
    data: resolvida ? { resolvidaEm: new Date(), resolvidaPorId: user.id } : { resolvidaEm: null, resolvidaPorId: null },
  });
  return NextResponse.json({ success: true, revisao: atualizada });
}
