// PATCH  /api/rh/ferias/[id] → edita a programação (recalcula valor/data fim)
// DELETE /api/rh/ferias/[id] → remove a programação
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { valorFerias, fimGozo } from "@/lib/ferias-calc";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  diasGozo: z.number().int().min(1).max(30).optional(),
  diasVendidos: z.number().int().min(0).max(10).optional(),
  descontos: z.number().min(0).optional(),
  status: z.enum(["PENDENTE", "PROGRAMADA", "GOZADA", "CANCELADA"]).optional(),
  observacao: z.string().max(500).optional().nullable(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const atual = await prisma.ferias.findUnique({
    where: { id: params.id },
    select: { id: true, diasGozo: true, diasVendidos: true, descontos: true, dataInicio: true, funcionario: { select: { salario: true } } },
  });
  if (!atual) return NextResponse.json({ success: false, error: "Programação não encontrada" }, { status: 404 });

  const d = parsed.data;
  const diasGozo = d.diasGozo ?? atual.diasGozo ?? 30;
  const diasVendidos = d.diasVendidos ?? atual.diasVendidos ?? 0;
  const descontos = d.descontos ?? atual.descontos ?? 0;
  if (diasGozo + diasVendidos > 30) return NextResponse.json({ success: false, error: "Gozo + vendidos não pode passar de 30 dias" }, { status: 400 });
  const dataInicioStr = d.dataInicio ?? (atual.dataInicio ? new Date(atual.dataInicio).toISOString().slice(0, 10) : null);

  const data = {
    ...(d.status ? { status: d.status } : {}),
    ...(d.observacao !== undefined ? { observacao: d.observacao || null } : {}),
    diasGozo, diasVendidos, descontos,
    valorEstimado: valorFerias(atual.funcionario?.salario, diasGozo, diasVendidos, descontos).total,
    ...(dataInicioStr ? { dataInicio: new Date(dataInicioStr), dataFim: new Date(fimGozo(dataInicioStr, diasGozo)) } : {}),
  };

  const ferias = await prisma.ferias.update({ where: { id: params.id }, data });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "EDITAR_FERIAS", entity: "Ferias", entityId: params.id, diff: d },
  }).catch(() => {});

  return NextResponse.json({ success: true, ferias });
}

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const existe = await prisma.ferias.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ success: false, error: "Programação não encontrada" }, { status: 404 });

  await prisma.ferias.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "EXCLUIR_FERIAS", entity: "Ferias", entityId: params.id, diff: {} },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
