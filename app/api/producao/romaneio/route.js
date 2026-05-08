import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  numero: z.string().min(1),
  opId: z.string().nullable().optional(),
  data: z.string(),
  pesoRealKg: z.number().min(0),
  descricao: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  valorPorKg: z.number().min(0).nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "FINANCEIRO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const valorTotal = body.valorPorKg ? body.pesoRealKg * body.valorPorKg : null;

  const created = await prisma.romaneio.create({
    data: {
      numero: body.numero.trim(),
      opId: body.opId || null,
      data: new Date(body.data),
      pesoRealKg: body.pesoRealKg,
      descricao: body.descricao || null,
      observacao: body.observacao || null,
      valorPorKg: body.valorPorKg ?? null,
      valorTotal,
      createdById: user.id,
    },
  });

  return NextResponse.json({ id: created.id });
}
