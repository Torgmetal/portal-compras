import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 60;

/**
 * GET /api/expedicao/confronto
 *
 * Sem params → lista de OPs com peças cadastradas (para dropdown)
 * ?opId=xxx → confronto peça-a-peça: qtd planejada × qtd expedida via romaneios
 */
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "FINANCEIRO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  try {
  const { searchParams } = new URL(req.url);
  const opId = searchParams.get("opId");

  // ── Sem opId: lista de OPs ──
  if (!opId) {
    const ops = await prisma.oP.findMany({
      where: { status: { notIn: ["CANCELADA"] } },
      select: {
        id: true,
        numero: true,
        cliente: true,
        obra: true,
        status: true,
        _count: { select: { pecasConjunto: true, romaneios: true } },
      },
      orderBy: { numero: "asc" },
    });

    const lista = ops
      .filter((o) => o._count.pecasConjunto > 0)
      .map((o) => ({
        id: o.id,
        numero: o.numero,
        cliente: o.cliente,
        obra: o.obra,
        status: o.status,
        totalPecas: o._count.pecasConjunto,
        totalRomaneios: o._count.romaneios,
      }));

    return NextResponse.json({ ops: lista });
  }

  // ── Com opId: confronto detalhado ──
  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: { id: true, numero: true, cliente: true, obra: true, status: true },
  });

  if (!op) {
    return NextResponse.json({ success: false, error: "OP não encontrada." }, { status: 404 });
  }

  // Todas as peças da OP com seus romaneio itens
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId },
    select: {
      id: true,
      marca: true,
      descricao: true,
      qte: true,
      pesoUnitKg: true,
      pesoTotalKg: true,
      status: true,
      material: true,
      perfil: true,
      tipoPeca: true,
      romaneioItens: {
        select: {
          qtd: true,
          pesoKg: true,
          romaneio: {
            select: {
              numero: true,
              data: true,
              pesoRealKg: true,
            },
          },
        },
      },
    },
    orderBy: { marca: "asc" },
  });

  // Itens de romaneio SEM peça vinculada (acessórios, extras)
  const itensExtras = await prisma.romaneioItem.findMany({
    where: {
      romaneio: { opId },
      pecaConjuntoId: null,
    },
    select: {
      tipo: true,
      descricao: true,
      qtd: true,
      pesoKg: true,
      romaneio: {
        select: { numero: true, data: true },
      },
    },
    orderBy: { romaneio: { data: "asc" } },
  });

  // Romaneios da OP (resumo)
  const romaneios = await prisma.romaneio.findMany({
    where: { opId },
    select: {
      id: true,
      numero: true,
      data: true,
      pesoRealKg: true,
      valorTotal: true,
      descricao: true,
      _count: { select: { itens: true } },
    },
    orderBy: { data: "asc" },
  });

  // Montar confronto peça-a-peça
  let totalPecas = 0;
  let pecasCompletas = 0;
  let pecasParciais = 0;
  let pecasPendentes = 0;
  let pesoTotal = 0;
  let pesoExpedido = 0;

  const confronto = pecas.map((p) => {
    const qtdPlanejada = p.qte || 1;
    const qtdExpedida = p.romaneioItens.reduce((s, ri) => s + (ri.qtd || 0), 0);
    const qtdPendente = Math.max(0, qtdPlanejada - qtdExpedida);

    const pesoUnitKg = p.pesoUnitKg || 0;
    const pesoTotalPeca = p.pesoTotalKg || 0;
    const pesoExpedidoPeca = qtdExpedida * pesoUnitKg;
    const pesoPendentePeca = qtdPendente * pesoUnitKg;

    let statusConfronto;
    if (qtdPendente === 0 || p.status === "EXPEDIDO") {
      statusConfronto = "COMPLETO";
      pecasCompletas++;
    } else if (qtdExpedida > 0) {
      statusConfronto = "PARCIAL";
      pecasParciais++;
    } else {
      statusConfronto = "PENDENTE";
      pecasPendentes++;
    }

    totalPecas++;
    pesoTotal += pesoTotalPeca;
    pesoExpedido += Math.min(pesoExpedidoPeca, pesoTotalPeca);

    // Agrupar romaneios únicos
    const romMap = new Map();
    for (const ri of p.romaneioItens) {
      const key = ri.romaneio.numero;
      if (romMap.has(key)) {
        const existing = romMap.get(key);
        existing.qtd += ri.qtd || 0;
        existing.pesoKg += ri.pesoKg || 0;
      } else {
        romMap.set(key, {
          numero: ri.romaneio.numero,
          data: ri.romaneio.data,
          qtd: ri.qtd || 0,
          pesoKg: ri.pesoKg || 0,
        });
      }
    }

    return {
      id: p.id,
      marca: p.marca,
      descricao: p.descricao,
      material: p.material,
      perfil: p.perfil,
      tipoPeca: p.tipoPeca,
      qtdPlanejada,
      pesoUnitKg,
      pesoTotalKg: pesoTotalPeca,
      qtdExpedida,
      pesoExpedido: Math.min(pesoExpedidoPeca, pesoTotalPeca),
      qtdPendente,
      pesoPendente: pesoPendentePeca,
      statusProd: p.status,
      statusConfronto,
      romaneios: Array.from(romMap.values()),
    };
  });

  const pesoPendente = pesoTotal - pesoExpedido;
  const pctPeso = pesoTotal > 0 ? Math.round((pesoExpedido / pesoTotal) * 100) : 0;

  return NextResponse.json({
    op,
    kpis: {
      totalPecas,
      pecasCompletas,
      pecasParciais,
      pecasPendentes,
      pesoTotal,
      pesoExpedido,
      pesoPendente,
      pctPeso,
      pctPecas: totalPecas > 0 ? Math.round((pecasCompletas / totalPecas) * 100) : 0,
      totalRomaneios: romaneios.length,
      pesoRomaneios: romaneios.reduce((s, r) => s + (r.pesoRealKg || 0), 0),
    },
    pecas: confronto,
    romaneios: romaneios.map((r) => ({
      id: r.id,
      numero: r.numero,
      data: r.data,
      pesoRealKg: r.pesoRealKg,
      valorTotal: r.valorTotal,
      descricao: r.descricao,
      totalItens: r._count.itens,
    })),
    itensExtras: itensExtras.map((ie) => ({
      romaneioNumero: ie.romaneio.numero,
      data: ie.romaneio.data,
      tipo: ie.tipo,
      descricao: ie.descricao,
      qtd: ie.qtd,
      pesoKg: ie.pesoKg,
    })),
  });
  } catch (e) {
    console.error("Erro em /api/expedicao/confronto:", e);
    return NextResponse.json({ success: false, error: e.message || "Erro interno" }, { status: 500 });
  }
}
