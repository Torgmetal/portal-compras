import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({ vencedor: z.boolean() });

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode marcar vencedor." }, { status: 403 });
  }

  const body = schema.parse(await req.json());

  const cotItem = await prisma.cotacaoItem.findUnique({
    where: { id: params.id },
    select: { id: true, rmItemId: true, cotacaoId: true },
  });
  if (!cotItem) return NextResponse.json({ error: "Item de cotação não encontrado." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    if (body.vencedor) {
      // Desmarca vencedor de outras cotacaoItens do mesmo rmItem (so 1 vencedor por item)
      await tx.cotacaoItem.updateMany({
        where: { rmItemId: cotItem.rmItemId, vencedor: true, NOT: { id: cotItem.id } },
        data: { vencedor: false },
      });
    }
    await tx.cotacaoItem.update({
      where: { id: cotItem.id },
      data: { vencedor: body.vencedor },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: body.vencedor ? "marcar_vencedor" : "desmarcar_vencedor",
        entity: "CotacaoItem",
        entityId: cotItem.id,
        diff: { rmItemId: cotItem.rmItemId, cotacaoId: cotItem.cotacaoId },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
