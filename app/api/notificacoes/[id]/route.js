// PATCH /api/notificacoes/:id — marca uma notificacao como lida ou nao lida.
// DELETE /api/notificacoes/:id — remove a notificacao.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  lida: z.boolean(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }
  const n = await prisma.notificacao.findUnique({ where: { id: params.id } });
  if (!n) return NextResponse.json({ error: "Notificacao nao encontrada." }, { status: 404 });
  const atualizada = await prisma.notificacao.update({
    where: { id: n.id },
    data: { lida: body.lida, lidaEm: body.lida ? new Date() : null },
  });
  return NextResponse.json({ notificacao: atualizada });
}

export async function DELETE(req, { params }) {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas ADMIN." }, { status: 403 });
  }
  try {
    await prisma.notificacao.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Notificacao nao encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
