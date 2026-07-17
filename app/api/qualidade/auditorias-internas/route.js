// Auditorias internas (Qualidade): cronograma + relatório. GET lista; POST cria
// a entrada do cronograma (uma auditoria agendada, que depois recebe o relatório).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const auditorias = await prisma.auditoriaInterna.findMany({
    orderBy: [{ dataAuditoria: "desc" }, { numero: "desc" }],
    take: 300,
  });
  const lista = auditorias.map((a) => {
    const consts = Array.isArray(a.constatacoes) ? a.constatacoes : [];
    return {
      id: a.id, numero: a.numero, setor: a.setor, dataAuditoria: a.dataAuditoria,
      responsavelAcompanhamento: a.responsavelAcompanhamento, auditor: a.auditor, norma: a.norma,
      status: a.status, divulgadoEm: a.divulgadoEm,
      totalConstatacoes: consts.length,
      naoConformidades: consts.filter((c) => c.tipo === "NAO_CONFORME").length,
    };
  });
  return NextResponse.json({ auditorias: lista });
}

const schema = z.object({
  setor: z.string().min(1, "Informe o setor auditado.").max(120),
  dataAuditoria: z.string().min(1, "Informe a data da auditoria."),
  responsavelAcompanhamento: z.string().min(1, "Informe o responsável pelo acompanhamento.").max(120),
  auditor: z.string().max(120).optional().nullable(),
  norma: z.string().max(120).optional().nullable(),
  escopo: z.string().max(2000).optional().nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const ultima = await prisma.auditoriaInterna.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
  const numero = (ultima?.numero || 0) + 1;

  const a = await prisma.auditoriaInterna.create({
    data: {
      numero, setor: body.setor.trim(),
      dataAuditoria: new Date(body.dataAuditoria + "T12:00:00Z"),
      responsavelAcompanhamento: body.responsavelAcompanhamento.trim(),
      auditor: body.auditor?.trim() || null,
      norma: body.norma?.trim() || null,
      escopo: body.escopo?.trim() || null,
      createdById: user.id,
    },
    select: { id: true, numero: true },
  });

  await prisma.auditLog.create({ data: { userId: user.id, action: "CRIAR_AUDITORIA_INTERNA", entity: "AuditoriaInterna", entityId: a.id, diff: { numero, setor: body.setor } } }).catch(() => {});
  return NextResponse.json({ success: true, id: a.id, numero: a.numero });
}
