// PATCH / DELETE de um lote de entrega da OP.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];

const schema = z.object({
  nome: z.string().min(1).max(200).optional(),
  local: z.string().max(300).nullable().optional(),
  dataPrevista: z.string().nullable().optional(),
  pesoKg: z.number().nonnegative().nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
  ordem: z.number().int().optional(),
  status: z.enum(["PENDENTE", "ENTREGUE"]).optional(),
});

export async function PATCH(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const lote = await prisma.loteExpedicao.findFirst({ where: { id: params.loteId, opId: params.id }, select: { id: true } });
  if (!lote) return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.nome !== undefined) data.nome = body.nome.trim();
  if (body.local !== undefined) data.local = body.local?.trim() || null;
  if (body.dataPrevista !== undefined) data.dataPrevista = body.dataPrevista ? new Date(body.dataPrevista) : null;
  if (body.pesoKg !== undefined) data.pesoKg = body.pesoKg;
  if (body.observacao !== undefined) data.observacao = body.observacao?.trim() || null;
  if (body.ordem !== undefined) data.ordem = body.ordem;
  if (body.status !== undefined) data.status = body.status;

  const atualizado = await prisma.loteExpedicao.update({ where: { id: lote.id }, data });
  return NextResponse.json({ success: true, lote: atualizado });
}

export async function DELETE(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.loteExpedicao.deleteMany({ where: { id: params.loteId, opId: params.id } });
  return NextResponse.json({ success: true });
}
