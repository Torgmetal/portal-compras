// PUT /api/admin/engenharia-ia/limite — teto mensal em R$ por projetista (só o ADMIN do portal). null tira o acesso.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminDoPortal } from "@/lib/session";

export const runtime = "nodejs";
const schema = z.object({ userId: z.string().min(1).max(40), tetoMensalBrl: z.number().min(0).max(100_000).nullable() });

export async function PUT(req) {
  let admin;
  try { admin = await requireAdminDoPortal(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e?.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const user = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  if (body.tetoMensalBrl == null) await prisma.iaLimite.deleteMany({ where: { userId: body.userId } });
  else await prisma.iaLimite.upsert({ where: { userId: body.userId }, create: { userId: body.userId, tetoMensalBrl: body.tetoMensalBrl, atualizadoPorId: admin.id }, update: { tetoMensalBrl: body.tetoMensalBrl, atualizadoPorId: admin.id } });
  await prisma.auditLog.create({ data: { userId: admin.id, action: body.tetoMensalBrl == null ? "IA_LIMITE_REMOVER" : "IA_LIMITE_DEFINIR", entity: "IaLimite", entityId: body.userId, diff: { tetoMensalBrl: body.tetoMensalBrl } } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
