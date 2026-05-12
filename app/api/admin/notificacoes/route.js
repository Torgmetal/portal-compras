// GET: lista todos os inscritos. POST: cria novo inscrito.
// Apenas ADMIN pode gerenciar.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const EVENTOS_VALIDOS = ["RM_CRIADA"];

const schema = z.object({
  email: z.string().email(),
  nome: z.string().optional().nullable(),
  eventos: z.array(z.enum(EVENTOS_VALIDOS)).min(1),
  ativo: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas ADMIN." }, { status: 403 });
  }
  const inscritos = await prisma.emailNotificacao.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ inscritos });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas ADMIN." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  // Permite mesmo email pra eventos diferentes? Aqui aplicamos
  // unicidade do email — atualiza eventos se ja existir.
  const existe = await prisma.emailNotificacao.findFirst({ where: { email: body.email } });
  if (existe) {
    const updated = await prisma.emailNotificacao.update({
      where: { id: existe.id },
      data: {
        nome: body.nome || existe.nome,
        eventos: body.eventos,
        ativo: body.ativo,
      },
    });
    return NextResponse.json({ inscrito: updated, criado: false });
  }

  const inscrito = await prisma.emailNotificacao.create({
    data: {
      email: body.email,
      nome: body.nome || null,
      eventos: body.eventos,
      ativo: body.ativo,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "add_email_notificacao",
      entity: "EmailNotificacao",
      entityId: inscrito.id,
      diff: { email: body.email, eventos: body.eventos },
    },
  });

  return NextResponse.json({ inscrito, criado: true });
}
