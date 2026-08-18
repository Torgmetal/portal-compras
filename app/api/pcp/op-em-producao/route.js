// Liga/desliga "OP enviada para produção" (botão no painel de Liberar do PCP).
// Só as OPs em produção aparecem nas telas de Prioridades de Produção.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP"];

const schema = z.object({
  opId: z.string().optional(),
  opNumero: z.string().optional(),
  emProducao: z.boolean(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  if (!body.opId && !body.opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findFirst({ where: body.opId ? { id: body.opId } : { numero: body.opNumero }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const atualizada = await prisma.oP.update({
    where: { id: op.id },
    data: { emProducao: body.emProducao, emProducaoEm: body.emProducao ? new Date() : null, emProducaoPor: body.emProducao ? (user.name || user.id) : null },
    select: { id: true, numero: true, emProducao: true, emProducaoEm: true },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: body.emProducao ? "ENVIAR_OP_PRODUCAO" : "TIRAR_OP_PRODUCAO", entity: "OP", entityId: op.id, diff: { numero: op.numero } } }).catch(() => {});

  return NextResponse.json({ ok: true, op: atualizada });
}
