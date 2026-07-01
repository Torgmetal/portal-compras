// POST /api/rh/ponto/[id]/mapear  { itemId, funcionarioId }
// Vincula um item de ponto (PIS do ACJEF) a um funcionário E grava o PIS no
// cadastro, pra que a próxima competência case sozinha. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ itemId: z.string().min(1), funcionarioId: z.string().min(1) });

export async function POST(req, { params }) {
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
  const { itemId, funcionarioId } = parsed.data;

  const item = await prisma.pontoItem.findFirst({ where: { id: itemId, pontoId: params.id }, select: { id: true, pisArquivo: true } });
  if (!item) return NextResponse.json({ success: false, error: "Item não encontrado" }, { status: 404 });
  const func = await prisma.funcionario.findUnique({ where: { id: funcionarioId }, select: { id: true, nome: true, pis: true } });
  if (!func) return NextResponse.json({ success: false, error: "Funcionário não encontrado" }, { status: 404 });

  await prisma.$transaction([
    prisma.pontoItem.update({ where: { id: item.id }, data: { funcionarioId: func.id, nome: func.nome } }),
    // Grava o PIS no cadastro (se ainda não tiver) → casa sozinho no próximo mês
    ...(func.pis ? [] : [prisma.funcionario.update({ where: { id: func.id }, data: { pis: item.pisArquivo } })]),
  ]);

  await prisma.auditLog.create({
    data: { userId: user.id, action: "MAPEAR_PONTO_PIS", entity: "Funcionario", entityId: func.id, diff: { pis: item.pisArquivo, gravouPis: !func.pis } },
  }).catch(() => {});

  return NextResponse.json({ success: true, nome: func.nome, gravouPis: !func.pis });
}
