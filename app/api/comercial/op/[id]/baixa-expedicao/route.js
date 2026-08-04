// Baixa MANUAL de marcas na Lista de Expedição (sem romaneio).
// GET    — lista as baixas da OP
// POST   — dá baixa em marcas selecionadas com um motivo
// DELETE  ?id=  — desfaz uma baixa
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES = ["ADMIN", "EXPEDICAO", "PLANEJAMENTO", "COMERCIAL", "PCP", "ENGENHARIA"];
export const MOTIVOS = ["NAO_ENCONTRADA", "ADICIONADA", "ERRO_EXPEDICAO", "QTD_DIVERGENTE"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const baixas = await prisma.baixaExpedicao.findMany({ where: { opId: params.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ success: true, baixas });
}

const schema = z.object({
  motivo: z.enum(MOTIVOS),
  observacao: z.string().max(500).nullable().optional(),
  itens: z.array(z.object({
    marca: z.string().min(1),
    frente: z.string().nullable().optional(),
    qtd: z.coerce.number().min(0).default(0),
    pesoKg: z.coerce.number().min(0).default(0),
  })).min(1),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { const i = e.issues?.[0]; return NextResponse.json({ error: i ? `${(i.path || []).join(".") || "campo"}: ${i.message}` : "Dados inválidos" }, { status: 400 }); }

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const criados = await prisma.$transaction(
    body.itens.map((it) => prisma.baixaExpedicao.create({
      data: { opId: op.id, marca: it.marca.trim(), frente: it.frente?.trim() || null, motivo: body.motivo, qtd: it.qtd || 0, pesoKg: it.pesoKg || 0, observacao: body.observacao?.trim() || null, criadoPorId: user.id },
    }))
  );

  await prisma.auditLog.create({ data: { userId: user.id, action: "BAIXA_EXPEDICAO", entity: "OP", entityId: op.id, diff: { motivo: body.motivo, marcas: body.itens.map((i) => i.marca) } } }).catch(() => {});
  return NextResponse.json({ success: true, criados: criados.length });
}

export async function DELETE(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const b = await prisma.baixaExpedicao.findFirst({ where: { id, opId: params.id }, select: { id: true, marca: true } });
  if (!b) return NextResponse.json({ error: "Baixa não encontrada" }, { status: 404 });
  await prisma.baixaExpedicao.delete({ where: { id: b.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DESFAZER_BAIXA_EXPEDICAO", entity: "OP", entityId: params.id, diff: { marca: b.marca } } }).catch(() => {});
  return NextResponse.json({ success: true });
}
