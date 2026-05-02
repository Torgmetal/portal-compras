// Sugere o vencedor de cada RMItem da OP escolhendo a cotação com menor preço.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode marcar vencedor." }, { status: 403 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    include: {
      rms: {
        include: {
          itens: { select: { id: true } },
          cotacoes: {
            where: { status: "RECEBIDA" },
            include: {
              itens: { select: { id: true, rmItemId: true, precoUnit: true } },
            },
          },
        },
      },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  // Pra cada RMItem, encontra o CotacaoItem com menor preço (precoUnit > 0)
  const escolhas = []; // { rmItemId, cotacaoItemIdVencedor }
  for (const rm of op.rms) {
    for (const rmItem of rm.itens) {
      let melhor = null;
      for (const cot of rm.cotacoes) {
        const ci = cot.itens.find((i) => i.rmItemId === rmItem.id && i.precoUnit > 0);
        if (!ci) continue;
        if (!melhor || ci.precoUnit < melhor.precoUnit) {
          melhor = ci;
        }
      }
      if (melhor) {
        escolhas.push({ rmItemId: rmItem.id, cotacaoItemIdVencedor: melhor.id });
      }
    }
  }

  if (escolhas.length === 0) {
    return NextResponse.json({ ok: true, count: 0, message: "Nenhum item com preço pra sugerir." });
  }

  await prisma.$transaction(async (tx) => {
    const rmItemIds = escolhas.map((e) => e.rmItemId);
    // Desmarca todos os vencedores anteriores desses rmItens
    await tx.cotacaoItem.updateMany({
      where: { rmItemId: { in: rmItemIds }, vencedor: true },
      data: { vencedor: false },
    });
    // Marca os novos vencedores (menor preço)
    await tx.cotacaoItem.updateMany({
      where: { id: { in: escolhas.map((e) => e.cotacaoItemIdVencedor) } },
      data: { vencedor: true },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "sugerir_vencedores",
        entity: "OP",
        entityId: op.id,
        diff: { count: escolhas.length },
      },
    });
  });

  return NextResponse.json({ ok: true, count: escolhas.length });
}
