import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncExpedicaoProducao } from "@/lib/expedicao";

const schema = z.object({
  numero: z.string().min(1),
  opId: z.string().nullable().optional(),
  data: z.string(),
  pesoRealKg: z.number().min(0),
  descricao: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  valorPorKg: z.number().min(0).nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "FINANCEIRO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message || "Dados invalidos" },
      { status: 400 }
    );
  }

  const valorTotal = body.valorPorKg ? body.pesoRealKg * body.valorPorKg : null;

  const created = await prisma.romaneio.create({
    data: {
      numero: body.numero.trim(),
      opId: body.opId || null,
      data: new Date(body.data),
      pesoRealKg: body.pesoRealKg,
      descricao: body.descricao || null,
      observacao: body.observacao || null,
      valorPorKg: body.valorPorKg ?? null,
      valorTotal,
      createdById: user.id,
    },
  });

  // AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_romaneio",
      entity: "Romaneio",
      entityId: created.id,
      diff: { depois: { numero: created.numero, opId: created.opId, pesoRealKg: created.pesoRealKg, data: body.data } },
    },
  });

  // Auto-sync: atualiza ProducaoSemanal pra setor Expedicao
  if (created.opId) {
    try {
      await syncExpedicaoProducao(created.opId, new Date(body.data));
    } catch (err) {
      console.error("syncExpedicaoProducao erro:", err.message);
    }
  }

  return NextResponse.json({ success: true, id: created.id });
}
