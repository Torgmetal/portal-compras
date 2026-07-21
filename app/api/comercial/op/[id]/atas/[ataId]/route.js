// PATCH/DELETE /api/comercial/op/[id]/atas/[ataId] — editar / excluir uma ata da OP.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];

const schema = z.object({
  titulo: z.string().max(200).optional(),
  dataReuniao: z.string().nullable().optional(),
  participantes: z.string().max(500).nullable().optional(),
  pauta: z.string().max(20000).nullable().optional(),
  conteudoJson: z.any().optional(),
  anexos: z.array(z.object({ seq: z.number(), nome: z.string(), url: z.string(), tamanho: z.number().optional() })).optional(),
});

export async function PATCH(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ata = await prisma.ataOP.findFirst({ where: { id: params.ataId, opId: params.id }, select: { id: true } });
  if (!ata) return NextResponse.json({ error: "Ata não encontrada" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.titulo !== undefined) data.titulo = body.titulo;
  if (body.dataReuniao !== undefined) data.dataReuniao = body.dataReuniao ? new Date(body.dataReuniao) : null;
  if (body.participantes !== undefined) data.participantes = body.participantes;
  if (body.pauta !== undefined) data.pauta = body.pauta;
  if (body.conteudoJson !== undefined) data.conteudoJson = body.conteudoJson;
  if (body.anexos !== undefined) data.anexos = body.anexos;

  const atualizada = await prisma.ataOP.update({ where: { id: ata.id }, data });
  return NextResponse.json({ success: true, ata: atualizada });
}

export async function DELETE(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.ataOP.deleteMany({ where: { id: params.ataId, opId: params.id } });
  return NextResponse.json({ success: true });
}
