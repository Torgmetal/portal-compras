// Detalhe / edição de uma auditoria interna. PATCH salva tanto os dados da
// identificação quanto o relatório (constatações, ações, conclusão).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const a = await prisma.auditoriaInterna.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });
  return NextResponse.json({ auditoria: a });
}

const schema = z.object({
  setor: z.string().min(1).max(120).optional(),
  dataAuditoria: z.string().optional().nullable(),
  responsavelAcompanhamento: z.string().min(1).max(120).optional(),
  auditor: z.string().max(120).optional().nullable(),
  norma: z.string().max(120).optional().nullable(),
  escopo: z.string().max(2000).optional().nullable(),
  conclusao: z.string().max(4000).optional().nullable(),
  constatacoes: z.array(z.object({
    tipo: z.enum(["CONFORME", "NAO_CONFORME", "MELHORIA"]),
    descricao: z.string().max(2000),
  })).optional(),
  acoes: z.array(z.object({
    oque: z.string().max(1000),
    responsavel: z.string().max(120).optional().nullable(),
    prazo: z.string().optional().nullable(),
  })).optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const atual = await prisma.auditoriaInterna.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
  if (!atual) return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.setor !== undefined) data.setor = body.setor.trim();
  if (body.dataAuditoria !== undefined) data.dataAuditoria = body.dataAuditoria ? new Date(body.dataAuditoria + "T12:00:00Z") : undefined;
  if (body.responsavelAcompanhamento !== undefined) data.responsavelAcompanhamento = body.responsavelAcompanhamento.trim();
  if (body.auditor !== undefined) data.auditor = body.auditor?.trim() || null;
  if (body.norma !== undefined) data.norma = body.norma?.trim() || null;
  if (body.escopo !== undefined) data.escopo = body.escopo?.trim() || null;
  if (body.conclusao !== undefined) data.conclusao = body.conclusao?.trim() || null;
  if (body.constatacoes !== undefined) data.constatacoes = body.constatacoes.filter((c) => (c.descricao || "").trim()).map((c) => ({ tipo: c.tipo, descricao: c.descricao.trim() }));
  if (body.acoes !== undefined) data.acoes = body.acoes.filter((a) => (a.oque || "").trim()).map((a) => ({ oque: a.oque.trim(), responsavel: (a.responsavel || "").trim() || null, prazo: a.prazo || null }));

  // Enquanto não emitido, ganhar conteúdo de relatório marca como "em elaboração".
  const temRelatorio = (data.constatacoes?.length || 0) > 0 || !!data.conclusao || (data.acoes?.length || 0) > 0;
  if (atual.status === "AGENDADA" && temRelatorio) data.status = "REALIZADA";

  await prisma.auditoriaInterna.update({ where: { id: atual.id }, data });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.auditoriaInterna.delete({ where: { id: params.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "EXCLUIR_AUDITORIA_INTERNA", entity: "AuditoriaInterna", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true });
}
