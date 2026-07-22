// PATCH (renomear / reordenar) e DELETE de um desenho da OP.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];

const schema = z.object({
  nome: z.string().min(1).max(300).optional(),
  ordem: z.number().int().optional(),
  loteId: z.string().nullable().optional(),
});

export async function PATCH(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const d = await prisma.desenhoOP.findFirst({ where: { id: params.desenhoId, opId: params.id }, select: { id: true } });
  if (!d) return NextResponse.json({ error: "Desenho não encontrado" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const data = {};
  if (body.nome !== undefined) data.nome = body.nome.trim();
  if (body.ordem !== undefined) data.ordem = body.ordem;
  if (body.loteId !== undefined) {
    // null desvincula; um id precisa ser lote DESTA OP
    if (body.loteId === null) data.loteId = null;
    else {
      const l = await prisma.loteExpedicao.findFirst({ where: { id: body.loteId, opId: params.id }, select: { id: true } });
      data.loteId = l ? body.loteId : null;
    }
  }
  const desenho = await prisma.desenhoOP.update({ where: { id: d.id }, data });
  return NextResponse.json({ success: true, desenho });
}

export async function DELETE(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.desenhoOP.deleteMany({ where: { id: params.desenhoId, opId: params.id } });
  return NextResponse.json({ success: true });
}
