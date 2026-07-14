// POST /api/meu-rh/ponto/[id]/confirmar — colaborador dá ciência do cartão de
// ponto. Registra status CONFIRMADO + data/hora + IP. Idempotente (não regride).
// Mesmo padrão do holerite.
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

  const item = await prisma.pontoItem.findUnique({
    where: { id: params.id },
    select: { funcionarioId: true, status: true, confirmadoEm: true, visualizadoEm: true },
  });
  if (!item || item.funcionarioId !== user.funcionarioId) {
    return NextResponse.json({ success: false, error: "Cartão não encontrado" }, { status: 404 });
  }
  if (item.confirmadoEm) {
    return NextResponse.json({ success: true, jaConfirmado: true, confirmadoEm: item.confirmadoEm });
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  const atualizado = await prisma.pontoItem.update({
    where: { id: params.id },
    data: { status: "CONFIRMADO", confirmadoEm: new Date(), confirmadoIp: ip, ...(item.visualizadoEm ? {} : { visualizadoEm: new Date() }) },
    select: { confirmadoEm: true },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "CONFIRMAR_PONTO", entity: "PontoItem", entityId: params.id, diff: { ip } },
  }).catch(() => {});

  return NextResponse.json({ success: true, confirmadoEm: atualizado.confirmadoEm });
}
