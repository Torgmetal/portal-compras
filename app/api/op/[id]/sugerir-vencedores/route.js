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
      itens: { select: { categoria: true, faturamentoDireto: true } },
      aditivos: { include: { itens: { select: { categoria: true, faturamentoDireto: true } } } },
      rms: {
        select: {
          id: true,
          categoriasOP: true,
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

  // Fallback de FD por categoria (mesma logica do page.js)
  const fdPorCategoria = new Map();
  const todosOpItens = [
    ...op.itens.map((i) => ({ categoria: i.categoria, fd: i.faturamentoDireto })),
    ...op.aditivos.flatMap((a) => a.itens.map((i) => ({ categoria: i.categoria, fd: i.faturamentoDireto }))),
  ];
  for (const { categoria, fd } of todosOpItens) {
    if (!categoria) continue;
    if (!fdPorCategoria.has(categoria)) fdPorCategoria.set(categoria, fd);
    else if (fdPorCategoria.get(categoria) !== fd) fdPorCategoria.set(categoria, true);
  }
  // Marca cada RM como FD se TODAS suas categorias forem FD
  const rmFdMap = new Map();
  for (const rm of op.rms) {
    if (rm.categoriasOP && rm.categoriasOP.length > 0) {
      rmFdMap.set(rm.id, rm.categoriasOP.every((c) => fdPorCategoria.get(c) === true));
    }
  }

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
  // faturamento do ITEM (OPItem.faturamentoDireto ou AditivoItem.faturamentoDireto),
  // com fallback pra rm.categoriasOP quando RMItem nao tem vinculo direto.
  const escolhas = []; // { rmItemId, cotacaoItemIdVencedor }
  for (const rm of op.rms) {
    const rmFd = rmFdMap.get(rm.id) === true;
    for (const rmItem of rm.itens) {
      const candidatos = cotItensPorRmItem.get(rmItem.id) || [];
      if (candidatos.length === 0) continue;
      const itemEhFatDireto = !!(
        rmItem.opItem?.faturamentoDireto ||
        rmItem.aditivoItem?.faturamentoDireto ||
        rmFd
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
