// Dispensa de documento por funcionário (RH).
// POST   { funcionarioId, tipo, motivo? } — marca o documento como dispensável
//        (não obrigatório) para o funcionário. Só tipos com dispensavel:true.
// DELETE ?funcionarioId=&tipo=            — remove a dispensa (volta a ser obrigatório).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ehDispensavel, TIPOS_DISPENSAVEIS } from "@/lib/regras-documentos";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "RH"];

const schema = z.object({
  funcionarioId: z.string().min(1),
  tipo: z.string().min(1),
  motivo: z.string().max(300).nullable().optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  let body;
  try { body = schema.parse(await req.json()); } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  if (!ehDispensavel(body.tipo)) {
    return NextResponse.json({ success: false, error: `Documento não pode ser dispensado. Dispensáveis: ${TIPOS_DISPENSAVEIS.join(", ")}` }, { status: 400 });
  }
  const func = await prisma.funcionario.findUnique({ where: { id: body.funcionarioId }, select: { id: true } });
  if (!func) return NextResponse.json({ success: false, error: "Funcionário não encontrado" }, { status: 404 });

  const dispensa = await prisma.documentoDispensa.upsert({
    where: { funcionarioId_tipo: { funcionarioId: body.funcionarioId, tipo: body.tipo } },
    update: { motivo: body.motivo?.trim() || null },
    create: { funcionarioId: body.funcionarioId, tipo: body.tipo, motivo: body.motivo?.trim() || null, criadoPorId: user.id, criadoNome: user.name || null },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DISPENSAR_DOCUMENTO", entity: "Funcionario", entityId: body.funcionarioId, diff: { tipo: body.tipo, motivo: dispensa.motivo } } }).catch(() => {});
  return NextResponse.json({ success: true, dispensa });
}

export async function DELETE(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const sp = new URL(req.url).searchParams;
  const funcionarioId = sp.get("funcionarioId");
  const tipo = sp.get("tipo");
  if (!funcionarioId || !tipo) return NextResponse.json({ success: false, error: "funcionarioId e tipo obrigatórios" }, { status: 400 });

  await prisma.documentoDispensa.deleteMany({ where: { funcionarioId, tipo } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "REVERTER_DISPENSA_DOCUMENTO", entity: "Funcionario", entityId: funcionarioId, diff: { tipo } } }).catch(() => {});
  return NextResponse.json({ success: true });
}
