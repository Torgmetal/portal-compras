import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  dataFimNova: z.string().min(1),
  motivo: z.string().min(1),
});

export async function POST(req, { params }) {
  let user;
  try {
    // SOMENTE master pode ajustar prazo
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas o usuário master pode ajustar prazos." }, { status: 403 });
  }

  const body = schema.parse(await req.json());
  const novaData = new Date(body.dataFimNova);

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { dataFimPrevista: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const aj = await prisma.$transaction([
    prisma.ajustePrazo.create({
      data: {
        opId: params.id,
        dataFimAnterior: op.dataFimPrevista || new Date(),
        dataFimNova: novaData,
        motivo: body.motivo,
        createdById: user.id,
      },
    }),
    prisma.oP.update({
      where: { id: params.id },
      data: { dataFimPrevista: novaData },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ajuste_prazo",
      entity: "OP",
      entityId: params.id,
      diff: { de: op.dataFimPrevista, para: novaData, motivo: body.motivo },
    },
  });

  return NextResponse.json({ id: aj[0].id });
}
