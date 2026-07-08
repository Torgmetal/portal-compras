// PATCH /api/rh/ponto/[id]/itens  { itens: [{ id, ...totais }] }
// Salva os totais que o RH preenche (HE, faltas, noturno, DSR, ajuda de custo…).
// Bloqueia se FECHADA. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const num = z.number().finite().nonnegative().optional();
const itemSchema = z.object({
  id: z.string().min(1),
  horasNormais: num, horasExtras50: num, horasExtras60: num, horasExtras80: num,
  horasExtras100: num, horasExtras150: num, faltas: num, atrasos: num,
  adicionalNoturno: num, dsr: num, ajudaCusto: num,
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

  const ponto = await prisma.pontoCompetencia.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
  if (!ponto) return NextResponse.json({ success: false, error: "Competência não encontrada" }, { status: 404 });
  if (ponto.status === "FECHADA") return NextResponse.json({ success: false, error: "Competência fechada — reabra para editar" }, { status: 409 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  await prisma.$transaction(
    parsed.data.itens.map(({ id, ...campos }) =>
      prisma.pontoItem.updateMany({ where: { id, pontoId: ponto.id }, data: campos })
    )
  );

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EDITAR_PONTO", entity: "PontoCompetencia", entityId: ponto.id, diff: { itens: parsed.data.itens.length } },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
