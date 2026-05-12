// PATCH: atualiza eventos/ativo do inscrito. DELETE: remove.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const EVENTOS_VALIDOS = ["RM_CRIADA"];

const patchSchema = z.object({
  nome: z.string().optional().nullable(),
  eventos: z.array(z.enum(EVENTOS_VALIDOS)).optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas ADMIN." }, { status: 403 });
  }
  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }
  const existe = await prisma.emailNotificacao.findUnique({ where: { id: params.id } });
  if (!existe) return NextResponse.json({ error: "Nao encontrado." }, { status: 404 });

  const updated = await prisma.emailNotificacao.update({
    where: { id: params.id },
    data: body,
  });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "edit_email_notificacao",
      entity: "EmailNotificacao",
      entityId: existe.id,
      diff: { email: existe.email, antes: { eventos: existe.eventos, ativo: existe.ativo }, depois: { eventos: updated.eventos, ativo: updated.ativo } },
    },
  });
  return NextResponse.json({ inscrito: updated });
}

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas ADMIN." }, { status: 403 });
  }
  const existe = await prisma.emailNotificacao.findUnique({ where: { id: params.id } });
  if (!existe) return NextResponse.json({ error: "Nao encontrado." }, { status: 404 });

  await prisma.emailNotificacao.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_email_notificacao",
      entity: "EmailNotificacao",
      entityId: existe.id,
      diff: { email: existe.email },
    },
  });
  return NextResponse.json({ ok: true });
}
