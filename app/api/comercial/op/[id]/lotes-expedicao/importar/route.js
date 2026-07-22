// POST — importa vários lotes de uma vez (planilha já parseada no navegador).
// substituir=true apaga os existentes antes; senão anexa ao fim.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];

const loteSchema = z.object({
  nome: z.string().min(1).max(200),
  local: z.string().max(300).nullable().optional(),
  dataPrevista: z.string().nullable().optional(),
  pesoKg: z.number().nonnegative().nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
});
const schema = z.object({
  lotes: z.array(loteSchema).min(1, "Nenhum lote válido para importar.").max(1000),
  substituir: z.boolean().optional(),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  let base = 0;
  if (body.substituir) {
    await prisma.loteExpedicao.deleteMany({ where: { opId: op.id } });
  } else {
    const ult = await prisma.loteExpedicao.findFirst({ where: { opId: op.id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
    base = ult?.ordem ?? 0;
  }

  const data = body.lotes.map((l, i) => ({
    opId: op.id,
    ordem: base + i + 1,
    nome: l.nome.trim(),
    local: l.local?.trim() || null,
    dataPrevista: l.dataPrevista ? new Date(l.dataPrevista) : null,
    pesoKg: l.pesoKg ?? null,
    observacao: l.observacao?.trim() || null,
  }));
  const res = await prisma.loteExpedicao.createMany({ data });

  await prisma.auditLog.create({ data: { userId: user.id, action: "IMPORTAR_LOTES_EXPEDICAO", entity: "OP", entityId: op.id, diff: { criados: res.count, substituir: !!body.substituir } } }).catch(() => {});
  return NextResponse.json({ success: true, criados: res.count });
}
