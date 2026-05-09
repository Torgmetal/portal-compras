import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({ motivo: z.string().min(1) });

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin pode cancelar RM." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Motivo do cancelamento e obrigatorio." }, { status: 400 });
  }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: { itens: { select: { id: true, status: true } } },
  });
  if (!rm) return NextResponse.json({ error: "RM não encontrada." }, { status: 404 });
  if (rm.status === "PEDIDO_GERADO" || rm.status === "CANCELADA") {
    return NextResponse.json({ error: "RM já encerrada." }, { status: 409 });
  }

  // Itens ainda nao finalizados sao cancelados com o motivo do encerramento
  const itensPraCancelar = rm.itens.filter((i) =>
    i.status === "PENDENTE" || i.status === "EM_COTACAO" || i.status === "COTADO"
  );

  await prisma.$transaction(async (tx) => {
    if (itensPraCancelar.length > 0) {
      await tx.rMItem.updateMany({
        where: { id: { in: itensPraCancelar.map((i) => i.id) } },
        data: {
          status: "CANCELADO",
          canceladoMotivo: `Encerramento da RM: ${body.motivo}`,
          canceladoEm: new Date(),
        },
      });
    }
    await tx.rM.update({
      where: { id: params.id },
      data: { status: "CANCELADA", observacao: rm.observacao ? `${rm.observacao} | Encerrada: ${body.motivo}` : `Encerrada: ${body.motivo}` },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "encerrar_rm",
        entity: "RM",
        entityId: params.id,
        diff: { motivo: body.motivo, itensCancelados: itensPraCancelar.length },
      },
    });
  });

  return NextResponse.json({ ok: true, itensCancelados: itensPraCancelar.length });
}
