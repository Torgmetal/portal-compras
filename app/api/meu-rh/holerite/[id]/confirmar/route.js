// POST /api/meu-rh/holerite/[id]/confirmar — funcionário dá ciência/recebimento.
// Registra status CONFIRMADO + data/hora + IP. Idempotente (não regride).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFuncionario } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireFuncionario();
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const h = await prisma.holerite.findUnique({
    where: { id: params.id },
    select: { funcionarioId: true, status: true, confirmadoEm: true },
  });
  if (!h || h.funcionarioId !== user.funcionarioId) {
    return NextResponse.json({ success: false, error: "Holerite não encontrado" }, { status: 404 });
  }
  if (h.confirmadoEm) {
    return NextResponse.json({ success: true, jaConfirmado: true, confirmadoEm: h.confirmadoEm });
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  const atualizado = await prisma.holerite.update({
    where: { id: params.id },
    data: { status: "CONFIRMADO", confirmadoEm: new Date(), confirmadoIp: ip, ...(h.status === "PENDENTE" || h.status === "ENVIADO" ? { visualizadoEm: new Date() } : {}) },
    select: { confirmadoEm: true },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "CONFIRMAR_HOLERITE", entity: "Holerite", entityId: params.id, diff: { ip } },
  }).catch(() => {});

  return NextResponse.json({ success: true, confirmadoEm: atualizado.confirmadoEm });
}
