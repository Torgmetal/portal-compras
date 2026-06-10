import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  data: z.string().optional(),
  tipo: z.enum(["ENTRADA", "SAIDA"]).optional(),
  categoria: z.string().optional(),
  descricao: z.string().optional(),
  valor: z.number().min(0).optional(),
  realizado: z.boolean().optional(),
  dataRealizado: z.string().nullable().optional(),
  opId: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }
  const antes = await prisma.fluxoCaixa.findUnique({ where: { id: params.id } });
  const data = { ...body };
  if (data.data) data.data = new Date(data.data);
  if (data.dataRealizado) data.dataRealizado = new Date(data.dataRealizado);
  if (data.dataRealizado === "") data.dataRealizado = null;
  await prisma.fluxoCaixa.update({ where: { id: params.id }, data });

  try {
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ATUALIZAR_FLUXO_CAIXA",
        entity: "FluxoCaixa",
        entityId: params.id,
        diff: { antes, depois: data },
      },
    });
  } catch (e) {
    console.error("AuditLog error:", e);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  const antes = await prisma.fluxoCaixa.findUnique({ where: { id: params.id } });
  await prisma.fluxoCaixa.delete({ where: { id: params.id } });

  try {
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_FLUXO_CAIXA",
        entity: "FluxoCaixa",
        entityId: params.id,
        diff: { antes },
      },
    });
  } catch (e) {
    console.error("AuditLog error:", e);
  }

  return NextResponse.json({ ok: true });
}
