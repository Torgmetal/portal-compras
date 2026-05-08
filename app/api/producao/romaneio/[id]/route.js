import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  numero: z.string().optional(),
  opId: z.string().nullable().optional(),
  data: z.string().optional(),
  pesoRealKg: z.number().min(0).optional(),
  descricao: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  valorPorKg: z.number().min(0).nullable().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "FINANCEIRO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const data = { ...body };
  if (data.data) data.data = new Date(data.data);
  // Recalcula valorTotal se peso ou valorPorKg vier
  const atual = await prisma.romaneio.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  const peso = data.pesoRealKg ?? atual.pesoRealKg;
  const vpk = data.valorPorKg !== undefined ? data.valorPorKg : atual.valorPorKg;
  data.valorTotal = vpk ? peso * vpk : null;

  await prisma.romaneio.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "FINANCEIRO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  await prisma.romaneio.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
