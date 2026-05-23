import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncExpedicaoProducao } from "@/lib/expedicao";

const schema = z.object({
  numero: z.string().optional(),
  opId: z.string().nullable().optional(),
  data: z.string().optional(),
  pesoRealKg: z.number().min(0).optional(),
  descricao: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  valorPorKg: z.number().min(0).nullable().optional(),
});

export async function PATCH(req, { params }) {
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

  const atual = await prisma.romaneio.findUnique({ where: { id: params.id } });
  if (!atual) {
    return NextResponse.json({ success: false, error: "Romaneio nao encontrado" }, { status: 404 });
  }

  const data = { ...body };
  if (data.data) data.data = new Date(data.data);

  // Recalcula valorTotal
  const peso = data.pesoRealKg ?? atual.pesoRealKg;
  const vpk = data.valorPorKg !== undefined ? data.valorPorKg : atual.valorPorKg;
  data.valorTotal = vpk ? peso * vpk : null;

  const updated = await prisma.romaneio.update({ where: { id: params.id }, data });

  // AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "update_romaneio",
      entity: "Romaneio",
      entityId: params.id,
      diff: {
        antes: { numero: atual.numero, opId: atual.opId, pesoRealKg: atual.pesoRealKg, data: atual.data },
        depois: body,
      },
    },
  });

  // Auto-sync: se opId, data ou peso mudou, recalcular Expedicao
  try {
    const dataAnterior = atual.data;
    const opAnterior = atual.opId;
    const dataNova = updated.data;
    const opNova = updated.opId;

    // Sync a combinacao antiga (pra subtrair peso se mudou de dia/OP)
    if (opAnterior) {
      await syncExpedicaoProducao(opAnterior, dataAnterior);
    }
    // Sync a combinacao nova (se diferente da antiga)
    if (opNova && (opNova !== opAnterior || dataNova.getTime() !== dataAnterior.getTime())) {
      await syncExpedicaoProducao(opNova, dataNova);
    }
    // Se opId e data nao mudaram mas peso mudou, o sync da antiga ja cobriu
    if (opNova && opNova === opAnterior && dataNova.getTime() === dataAnterior.getTime()) {
      // Ja sincronizou acima no bloco opAnterior
    }
  } catch (err) {
    console.error("syncExpedicaoProducao erro:", err.message);
  }

  return NextResponse.json({ success: true, ok: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "FINANCEIRO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const romaneio = await prisma.romaneio.findUnique({ where: { id: params.id } });
  if (!romaneio) {
    return NextResponse.json({ success: false, error: "Romaneio nao encontrado" }, { status: 404 });
  }

  await prisma.romaneio.delete({ where: { id: params.id } });

  // AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_romaneio",
      entity: "Romaneio",
      entityId: params.id,
      diff: {
        antes: { numero: romaneio.numero, opId: romaneio.opId, pesoRealKg: romaneio.pesoRealKg, data: romaneio.data },
      },
    },
  });

  // Auto-sync: recalcula sem esse romaneio
  if (romaneio.opId) {
    try {
      await syncExpedicaoProducao(romaneio.opId, romaneio.data);
    } catch (err) {
      console.error("syncExpedicaoProducao erro:", err.message);
    }
  }

  return NextResponse.json({ success: true, ok: true });
}
