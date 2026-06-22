// GET  /api/planejamento/comunicacao — matriz completa { setor: {contatos, ativo} }
// PUT  /api/planejamento/comunicacao — upsert dos contatos de UM setor
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SETORES_COMUNICACAO, normalizarContatos, getMatrizCompleta } from "@/lib/comunicacao-setor";

export const runtime = "nodejs";

const schema = z.object({
  setor: z.enum(SETORES_COMUNICACAO),
  contatos: z.array(z.object({
    nome: z.string().max(120).optional().nullable(),
    email: z.string(),
  })).max(30),
  ativo: z.boolean().optional(),
});

export async function GET() {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const matriz = await getMatrizCompleta();
  return NextResponse.json({ matriz });
}

export async function PUT(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const contatos = normalizarContatos(body.contatos);
  const ativo = body.ativo !== false;

  const reg = await prisma.comunicacaoSetor.upsert({
    where: { setor: body.setor },
    create: { setor: body.setor, contatos, ativo },
    update: { contatos, ativo },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EDITAR_COMUNICACAO_SETOR", entity: "ComunicacaoSetor", entityId: body.setor, diff: { contatos: contatos.length, ativo } },
  }).catch(() => {});

  return NextResponse.json({ success: true, setor: reg.setor, contatos, ativo });
}
