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
          itens: {
            select: {
              id: true,
              opItem: { select: { faturamentoDireto: true } },
              aditivoItem: { select: { faturamentoDireto: true } },
            },
          },
        },
      },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  // Busca cotacoes RECEBIDAS que tocam essa OP — primaria por rmId OU
  // por qualquer item ligado a uma RM dessa OP (consolidadas).
  const rmIdsDaOP = op.rms.map((r) => r.id);
  const cotacoes = await prisma.cotacao.findMany({
    where: {
      status: "RECEBIDA",
      OR: [
        { rmId: { in: rmIdsDaOP } },
        { itens: { some: { rmItem: { rmId: { in: rmIdsDaOP } } } } },
      ],
    },
    include: {
      itens: { select: { id: true, rmItemId: true, precoUnit: true, icmsPct: true, ipiPct: true } },
    },
  });

  // Mapa rmItemId -> lista de CotacaoItens
  const cotItensPorRmItem = new Map();
  for (const cot of cotacoes) {
    for (const ci of cot.itens) {
      if (!ci.precoUnit || ci.precoUnit <= 0) continue;
      if (!cotItensPorRmItem.has(ci.rmItemId)) cotItensPorRmItem.set(ci.rmItemId, []);
      cotItensPorRmItem.get(ci.rmItemId).push(ci);
    }
  }

  // Pra cada RMItem, escolhe o vencedor pelo CRITERIO CORRETO baseado no
  // faturamento do ITEM (OPItem.faturamentoDireto ou AditivoItem.faturamentoDireto):
  // - Item de Faturamento Direto: compara pelo BRUTO + IPI (ICMS nao
  //   vira credito pra Torg — a NF vai pro cliente)
  // - Item de Faturamento Torg: compara pelo LIQUIDO (com credito ICMS)
  const escolhas = []; // { rmItemId, cotacaoItemIdVencedor }
  for (const rm of op.rms) {
    for (const rmItem of rm.itens) {
      const candidatos = cotItensPorRmItem.get(rmItem.id) || [];
      if (candidatos.length === 0) continue;
      const itemEhFatDireto = !!(
        rmItem.opItem?.faturamentoDireto || rmItem.aditivoItem?.faturamentoDireto
      );
      let melhor = null;
      let melhorComparacao = null;
      for (const ci of candidatos) {
        const icms = Number(ci.icmsPct) || 0;
        const ipi = Number(ci.ipiPct) || 0;
        const valorComparacao = itemEhFatDireto
          ? ci.precoUnit * (1 + ipi / 100)
          : ci.precoUnit * (1 - icms / 100) * (1 + ipi / 100);
        if (melhorComparacao === null || valorComparacao < melhorComparacao) {
          melhorComparacao = valorComparacao;
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
