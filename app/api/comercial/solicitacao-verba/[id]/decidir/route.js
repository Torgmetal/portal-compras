import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  decisao: z.enum(["APROVADA", "REJEITADA"]),
  observacao: z.string().optional(),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas o master pode aprovar/rejeitar." }, { status: 403 });
  }

  const body = schema.parse(await req.json());

  const sol = await prisma.solicitacaoVerba.findUnique({
    where: { id: params.id },
    include: { opItem: true, aditivoItem: true },
  });
  if (!sol) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (sol.status !== "PENDENTE") {
    return NextResponse.json({ error: "Solicitação já foi decidida." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.solicitacaoVerba.update({
      where: { id: sol.id },
      data: {
        status: body.decisao,
        decididoEm: new Date(),
        decididoById: user.id,
        observacaoMaster: body.observacao || null,
      },
    });

    if (body.decisao === "APROVADA") {
      if (sol.opItemId) {
        await tx.oPItem.update({
          where: { id: sol.opItemId },
          data: { valorVerba: sol.valorProposto },
        });
      } else if (sol.aditivoItemId) {
        await tx.aditivoItem.update({
          where: { id: sol.aditivoItemId },
          data: { valorVerba: sol.valorProposto },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: body.decisao === "APROVADA" ? "aprovar_verba" : "rejeitar_verba",
        entity: "SolicitacaoVerba",
        entityId: sol.id,
        diff: {
          de: sol.valorAtual,
          para: sol.valorProposto,
          observacao: body.observacao || null,
        },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
