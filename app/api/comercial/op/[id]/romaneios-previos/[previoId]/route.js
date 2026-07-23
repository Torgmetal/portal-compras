// PATCH (data/local/observação/status) e DELETE de um romaneio prévio.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"];

const schema = z.object({
  dataPrevista: z.string().nullable().optional(),
  local: z.string().max(300).nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
  status: z.enum(["PREVISTO", "CONFIRMADO", "CANCELADO"]).optional(),
});

export async function PATCH(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const p = await prisma.romaneioPrevio.findFirst({ where: { id: params.previoId, opId: params.id }, select: { id: true } });
  if (!p) return NextResponse.json({ error: "Romaneio prévio não encontrado" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.dataPrevista !== undefined) data.dataPrevista = body.dataPrevista ? new Date(body.dataPrevista) : null;
  if (body.local !== undefined) data.local = body.local?.trim() || null;
  if (body.observacao !== undefined) data.observacao = body.observacao?.trim() || null;
  if (body.status !== undefined) data.status = body.status;

  const previo = await prisma.romaneioPrevio.update({ where: { id: p.id }, data });
  return NextResponse.json({ success: true, previo });
}

export async function DELETE(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.romaneioPrevio.deleteMany({ where: { id: params.previoId, opId: params.id } });
  return NextResponse.json({ success: true });
}
