import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const patchSchema = z.object({
  acao: z.enum(["finalizar", "reabrir", "cancelar"]),
});

// PATCH — muda status (finalizar / reabrir / cancelar)
export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const op = await prisma.oP.findUnique({ where: { id: params.id } });
  if (!op) return NextResponse.json({ error: "OP nao encontrada" }, { status: 404 });

  let dataUpdate = {};
  if (body.acao === "finalizar") {
    dataUpdate = { status: "ENCERRADA", dataFimReal: new Date() };
  } else if (body.acao === "reabrir") {
    dataUpdate = { status: op.dataInicio ? "EM_EXECUCAO" : "ABERTA", dataFimReal: null };
  } else if (body.acao === "cancelar") {
    dataUpdate = { status: "CANCELADA" };
  }

  const updated = await prisma.oP.update({
    where: { id: params.id },
    data: dataUpdate,
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `op_${body.acao}`,
      entity: "OP",
      entityId: op.id,
      diff: { numero: op.numero, statusAnterior: op.status, statusNovo: updated.status },
    },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}

// DELETE — exclusao definitiva, so permite se nao tiver RMs vinculadas
export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { rms: true, aditivos: true, revisoes: true, ajustesPrazo: true } },
    },
  });
  if (!op) return NextResponse.json({ error: "OP nao encontrada" }, { status: 404 });

  if (op._count.rms > 0) {
    return NextResponse.json(
      {
        error: `Nao da pra excluir: a OP ${op.numero} tem ${op._count.rms} RM(s) vinculada(s). Use 'Cancelar' pra arquivar mantendo o historico.`,
      },
      { status: 409 }
    );
  }

  // Cascateia: aditivos (e seus itens), revisoes, ajustes, itens da OP.
  // SolicitacaoVerba cascateia automatico via OPItem/AditivoItem (onDelete: Cascade no schema).
  await prisma.$transaction(async (tx) => {
    await tx.aditivoItem.deleteMany({ where: { aditivo: { opId: op.id } } });
    await tx.aditivo.deleteMany({ where: { opId: op.id } });
    await tx.revisao.deleteMany({ where: { opId: op.id } });
    await tx.ajustePrazo.deleteMany({ where: { opId: op.id } });
    await tx.oPItem.deleteMany({ where: { opId: op.id } });
    await tx.oP.delete({ where: { id: op.id } });
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_op",
      entity: "OP",
      entityId: op.id,
      diff: {
        numero: op.numero,
        cliente: op.cliente,
        aditivos: op._count.aditivos,
        revisoes: op._count.revisoes,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
