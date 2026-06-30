// PATCH /api/rh/folha/[id]/itens  { itens: [{ id, ...campos }] }
// Salva os valores digitados nos itens da folha. Bloqueia se a competência está
// FECHADA. Devolve o resumo recalculado. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { resumo } from "@/lib/folha-calc";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const num = z.number().finite().nonnegative().optional();
const itemSchema = z.object({
  id: z.string().min(1),
  salarioBase: num, horasExtras: num, adicionais: num, descontos: num,
  inss: num, irrf: num, liquido: num, vr: num, ifood: num, kr: num, rescisao: num,
  observacao: z.string().max(500).optional().nullable(),
}).strict();

const schema = z.object({ itens: z.array(itemSchema).min(1) });

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const folha = await prisma.folhaCompetencia.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
  if (!folha) return NextResponse.json({ success: false, error: "Competência não encontrada" }, { status: 404 });
  if (folha.status === "FECHADA") return NextResponse.json({ success: false, error: "Competência fechada — reabra para editar" }, { status: 409 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  // updateMany com {id, folhaId} garante que só altera itens DESTA folha.
  await prisma.$transaction(
    parsed.data.itens.map(({ id, ...campos }) =>
      prisma.folhaItem.updateMany({ where: { id, folhaId: folha.id }, data: campos })
    )
  );

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EDITAR_FOLHA", entity: "FolhaCompetencia", entityId: folha.id, diff: { itens: parsed.data.itens.length } },
  }).catch(() => {});

  const itens = await prisma.folhaItem.findMany({ where: { folhaId: folha.id } });
  return NextResponse.json({ success: true, resumo: resumo(itens) });
}
