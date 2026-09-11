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

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 });
  }

  const cotItem = await prisma.cotacaoItem.findUnique({
    where: { id: params.id },
    select: { id: true, rmItemId: true, cotacaoId: true, semEstoque: true, precoUnit: true },
  });
  if (!cotItem) return NextResponse.json({ error: "Item de cotação não encontrado." }, { status: 404 });

  // ⚠⚠ ITEM SEM DISPONIBILIDADE NÃO PODE VENCER, E A REGRA É DO SERVIDOR. Matheus (11/09/2026):
  // "quando eles marcarem sem disponibilidade, mesmo que preencham números de valores, deve ficar
  // como sem disponibilidade no portal". A tela já não deixa clicar na célula, mas quem garantia
  // isso era só a tela — e é do vencedor que sai o pedido. Vencedor com preço zero também não: o
  // gerador o ignoraria em silêncio e o comprador ficaria esperando um pedido que nunca sai.
  if (body.vencedor && (cotItem.semEstoque || !(Number(cotItem.precoUnit) > 0))) {
    return NextResponse.json({
      error: cotItem.semEstoque
        ? "Este fornecedor informou que não tem disponibilidade deste item."
        : "Item sem preço não pode ser marcado como vencedor.",
    }, { status: 409 });
  }

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
