// Sugere vencedor de cada RMItem da RM escolhendo a cotação com menor preço.
// Versão simplificada do /api/op/[id]/sugerir-vencedores para RMs sem OP.
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

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: { itens: { select: { id: true } } },
  });
  if (!rm) return NextResponse.json({ error: "RM não encontrada." }, { status: 404 });

  const cotacoes = await prisma.cotacao.findMany({
    where: {
      status: "RECEBIDA",
      OR: [
        { rmId: rm.id },
        { itens: { some: { rmItem: { rmId: rm.id } } } },
      ],
    },
    include: {
      itens: { select: { id: true, rmItemId: true, precoUnit: true, icmsPct: true, ipiPct: true } },
    },
  });

  const cotItensPorRmItem = new Map();
  for (const cot of cotacoes) {
    for (const ci of cot.itens) {
      if (!ci.precoUnit || ci.precoUnit <= 0) continue;
      if (!cotItensPorRmItem.has(ci.rmItemId)) cotItensPorRmItem.set(ci.rmItemId, []);
      cotItensPorRmItem.get(ci.rmItemId).push(ci);
    }
  }

  // RM interna sem OP → sem faturamento direto, compara preço líquido (com IPI, sem ICMS)
  const escolhas = [];
  for (const rmItem of rm.itens) {
    const candidatos = cotItensPorRmItem.get(rmItem.id) || [];
    if (candidatos.length === 0) continue;
    let melhor = null;
    let melhorValor = null;
    for (const ci of candidatos) {
      const icms = Number(ci.icmsPct) || 0;
      const ipi = Number(ci.ipiPct) || 0;
      const valor = ci.precoUnit * (1 - icms / 100) * (1 + ipi / 100);
      if (melhorValor === null || valor < melhorValor) {
        melhorValor = valor;
        melhor = ci;
      }
    }
    if (melhor) {
      escolhas.push({ rmItemId: rmItem.id, cotacaoItemIdVencedor: melhor.id });
    }
  }

  if (escolhas.length === 0) {
    return NextResponse.json({ ok: true, count: 0, message: "Nenhum item com preço pra sugerir." });
  }

  await prisma.$transaction(async (tx) => {
    const rmItemIds = escolhas.map((e) => e.rmItemId);
    await tx.cotacaoItem.updateMany({
      where: { rmItemId: { in: rmItemIds }, vencedor: true },
      data: { vencedor: false },
    });
    await tx.cotacaoItem.updateMany({
      where: { id: { in: escolhas.map((e) => e.cotacaoItemIdVencedor) } },
      data: { vencedor: true },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "sugerir_vencedores_rm",
        entity: "RM",
        entityId: rm.id,
        diff: { count: escolhas.length },
      },
    });
  });

  return NextResponse.json({ ok: true, count: escolhas.length });
}
