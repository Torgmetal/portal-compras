// /api/relatorios/[id]
//   GET    → relatório completo (com blocos/fotos).
//   PATCH  → atualiza título/resumo/OP/blocos/status.
//   DELETE → remove.
// Acesso: Comercial/Produção/Engenharia/PCP/Qualidade (+ ADMIN).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { MODS_RELATORIOS } from "@/lib/relatorios";

export const runtime = "nodejs";

const fotoSchema = z.object({
  url: z.string().url(),
  legenda: z.string().max(300).optional().default(""),
});
const blocoSchema = z.object({
  id: z.string().optional(),
  titulo: z.string().max(200).optional().default(""),
  descricao: z.string().max(8000).optional().default(""),
  fotos: z.array(fotoSchema).optional().default([]),
});
const updateSchema = z.object({
  titulo: z.string().trim().min(2).max(200).optional(),
  resumo: z.string().max(8000).nullable().optional(),
  cliente: z.string().nullable().optional(),
  obra: z.string().nullable().optional(),
  opId: z.string().nullable().optional(),
  opNumero: z.string().nullable().optional(),
  status: z.enum(["RASCUNHO", "EMITIDO"]).optional(),
  blocos: z.array(blocoSchema).max(60).optional(),
});

export async function GET(_req, { params }) {
  try { await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rel = await prisma.relatorioStatus.findUnique({ where: { id: params.id } });
  if (!rel) return NextResponse.json({ success: false, error: "Relatório não encontrado" }, { status: 404 });
  return NextResponse.json({ success: true, relatorio: rel });
}

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const existe = await prisma.relatorioStatus.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ success: false, error: "Relatório não encontrado" }, { status: 404 });

  const d = parsed.data;
  const data = {};
  for (const k of ["titulo", "resumo", "cliente", "obra", "opId", "opNumero", "status"]) {
    if (k in d) data[k] = d[k];
  }
  if (d.blocos) data.blocos = d.blocos;

  const rel = await prisma.relatorioStatus.update({ where: { id: params.id }, data });
  return NextResponse.json({ success: true, relatorio: rel });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rel = await prisma.relatorioStatus.findUnique({ where: { id: params.id }, select: { id: true, titulo: true } });
  if (!rel) return NextResponse.json({ success: false, error: "Relatório não encontrado" }, { status: 404 });

  await prisma.relatorioStatus.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "EXCLUIR_RELATORIO_STATUS", entity: "RelatorioStatus", entityId: params.id, diff: { titulo: rel.titulo } },
  }).catch(() => {});
  return NextResponse.json({ success: true });
}
