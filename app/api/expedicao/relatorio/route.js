import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 60;

/**
 * GET /api/expedicao/relatorio
 *
 * Sem params → lista de OPs com resumo de expedição (pra dropdown)
 * ?opId=xxx → detalhes: romaneios com itens, peças expedidas vs pendentes
 * ?opId=xxx&de=2026-01-01&ate=2026-06-30 → filtra romaneios por período
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

  // ── Sem opId: lista de OPs com resumo de expedição ──
  if (!opId) {
    const ops = await prisma.oP.findMany({
      where: { status: { notIn: ["CANCELADA"] } },
      select: {
        id: true,
        numero: true,
        cliente: true,
        obra: true,
        status: true,
        romaneios: {
          select: {
            id: true,
            pesoRealKg: true,
            valorTotal: true,
          },
        },
        pecasConjunto: {
          select: {
            id: true,
            pesoTotalKg: true,
            status: true,
          },
        },
      },
      orderBy: { numero: "asc" },
    });

    const lista = ops.map((op) => {
      const totalRomaneios = op.romaneios.length;
      const pesoExpedido = op.romaneios.reduce((s, r) => s + (r.pesoRealKg || 0), 0);
      const valorExpedido = op.romaneios.reduce((s, r) => s + (r.valorTotal || 0), 0);
      const totalPecas = op.pecasConjunto.length;
      const pecasExpedidas = op.pecasConjunto.filter((p) => p.status === "EXPEDIDO").length;
      const pesoTotalPecas = op.pecasConjunto.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);

      return {
        id: op.id,
        numero: op.numero,
        cliente: op.cliente,
        obra: op.obra,
        status: op.status,
        totalRomaneios,
        pesoExpedido,
        valorExpedido,
        totalPecas,
        pecasExpedidas,
        pesoTotalPecas,
        pctPecas: totalPecas > 0 ? Math.round((pecasExpedidas / totalPecas) * 100) : 0,
      };
    }).filter((o) => o.totalRomaneios > 0 || o.totalPecas > 0);

    return NextResponse.json({ ops: lista });
  }

  // ── Com opId: detalhes da expedição ──
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");

  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: { id: true, numero: true, cliente: true, obra: true, status: true },
  });

  if (!op) {
    return NextResponse.json({ success: false, error: "OP não encontrada." }, { status: 404 });
  }

  // Romaneios com itens
  const whereRomaneio = { opId };
  if (de || ate) {
    whereRomaneio.data = {};
    if (de) whereRomaneio.data.gte = new Date(de);
    if (ate) {
      const fimDia = new Date(ate);
      fimDia.setHours(23, 59, 59, 999);
      whereRomaneio.data.lte = fimDia;
    }
  }

  const romaneios = await prisma.romaneio.findMany({
    where: whereRomaneio,
    include: {
      itens: {
        include: {
          pecaConjunto: {
            select: {
              marca: true,
              descricao: true,
              pesoUnitKg: true,
              pesoTotalKg: true,
              qte: true,
              status: true,
              material: true,
              perfil: true,
            },
          },
          rmItem: {
            select: {
              descricao: true,
              unidade: true,
              qtd: true,
              peso: true,
            },
          },
        },
      },
    },
    orderBy: { data: "asc" },
  });

  // Peças da OP (todas, pra calcular progresso)
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
      romaneioItens: {
        select: {
          qtd: true,
          romaneio: { select: { numero: true, data: true } },
        },
      },
    },
    orderBy: { marca: "asc" },
  });

  // KPIs
  const pesoTotalPecas = pecas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
  const pecasExpedidas = pecas.filter((p) => p.status === "EXPEDIDO");
  const pesoExpedidoPecas = pecasExpedidas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);

  const totalPesoRomaneios = romaneios.reduce((s, r) => s + (r.pesoRealKg || 0), 0);
  const totalValorRomaneios = romaneios.reduce((s, r) => s + (r.valorTotal || 0), 0);

  // Itens expedidos (flatten de todos os romaneios)
  const itensExpedidos = [];
  for (const rom of romaneios) {
    for (const item of rom.itens) {
      itensExpedidos.push({
        romaneioNumero: rom.numero,
        romaneioData: rom.data,
        tipo: item.tipo,
        descricao: item.descricao,
        qtd: item.qtd,
        pesoKg: item.pesoKg,
        marca: item.pecaConjunto?.marca || null,
        material: item.pecaConjunto?.material || null,
        perfil: item.pecaConjunto?.perfil || null,
        pesoUnitPeca: item.pecaConjunto?.pesoUnitKg || null,
        pesoTotalPeca: item.pecaConjunto?.pesoTotalKg || null,
      });
    }
  }

  // Peças pendentes (não EXPEDIDO)
  const pecasPendentes = pecas
    .filter((p) => p.status !== "EXPEDIDO")
    .map((p) => ({
      marca: p.marca,
      descricao: p.descricao,
      qte: p.qte,
      pesoUnitKg: p.pesoUnitKg,
      pesoTotalKg: p.pesoTotalKg,
      status: p.status,
      material: p.material,
      perfil: p.perfil,
    }));

  return NextResponse.json({
    op,
    kpis: {
      totalPecas: pecas.length,
      pecasExpedidas: pecasExpedidas.length,
      pecasPendentes: pecas.length - pecasExpedidas.length,
      pctPecas: pecas.length > 0 ? Math.round((pecasExpedidas.length / pecas.length) * 100) : 0,
      pesoTotalPecas,
      pesoExpedidoPecas,
      pesoFaltante: pesoTotalPecas - pesoExpedidoPecas,
      totalRomaneios: romaneios.length,
      pesoRomaneios: totalPesoRomaneios,
      valorRomaneios: totalValorRomaneios,
    },
    romaneios: romaneios.map((r) => ({
      id: r.id,
      numero: r.numero,
      data: r.data,
      pesoRealKg: r.pesoRealKg,
      valorPorKg: r.valorPorKg,
      valorTotal: r.valorTotal,
      descricao: r.descricao,
      itens: r.itens.map((i) => ({
        tipo: i.tipo,
        descricao: i.descricao,
        qtd: i.qtd,
        pesoKg: i.pesoKg,
        marca: i.pecaConjunto?.marca || null,
        material: i.pecaConjunto?.material || null,
        perfil: i.pecaConjunto?.perfil || null,
      })),
    })),
    pecasPendentes,
    itensExpedidos,
  });
  } catch (e) {
    console.error("Erro em /api/expedicao/relatorio:", e);
    return NextResponse.json({ success: false, error: e.message || "Erro interno" }, { status: 500 });
  }
}
