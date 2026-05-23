// GET /api/expedicao/checklist?opId=xxx
// Retorna o checklist de expedição de uma OP:
// - Peças estruturais (PecaConjunto) com status e progresso
// - Acessórios expedíveis (RMItems de categorias como parafusos, telhas, etc.)
// - Romaneios já emitidos pra essa OP
// - Resumo geral de progresso
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isExpedivel, FLUXO_PECAS } from "@/lib/expedicao";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ENGENHARIA"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const opId = searchParams.get("opId");

  if (!opId) {
    return NextResponse.json(
      { success: false, error: "Parâmetro 'opId' obrigatório." },
      { status: 400 }
    );
  }

  // Busca a OP com dados básicos
  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: { id: true, numero: true, cliente: true, obra: true, status: true },
  });

  if (!op) {
    return NextResponse.json(
      { success: false, error: "OP não encontrada." },
      { status: 404 }
    );
  }

  // ─── 1. Peças estruturais (PecaConjunto) ──────────────────

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
      ultimoSetor: true,
      dataConcluida: true,
      romaneioItens: {
        select: {
          id: true,
          qtd: true,
          romaneio: { select: { id: true, numero: true, data: true } },
        },
      },
    },
    orderBy: [{ marca: "asc" }],
  });

  // Calcula progresso das peças
  const pecasResumo = {
    total: pecas.length,
    totalPesoKg: pecas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0),
    expedidas: pecas.filter((p) => p.status === "EXPEDIDO").length,
    pesoExpedidoKg: pecas
      .filter((p) => p.status === "EXPEDIDO")
      .reduce((s, p) => s + (p.pesoTotalKg || 0), 0),
    porStatus: {},
  };
  for (const s of FLUXO_PECAS) {
    pecasResumo.porStatus[s] = pecas.filter((p) => p.status === s).length;
  }

  // ─── 2. Acessórios expedíveis (RMItems) ───────────────────

  // Busca RMs da OP com seus itens e a categoria do OPItem/AditivoItem vinculado
  const rms = await prisma.rM.findMany({
    where: { opId, status: { not: "CANCELADA" } },
    select: {
      id: true,
      numero: true,
      itens: {
        where: { status: { not: "CANCELADO" } },
        select: {
          id: true,
          descricao: true,
          unidade: true,
          qtd: true,
          peso: true,
          status: true,
          opItem: { select: { categoria: true } },
          aditivoItem: { select: { categoria: true } },
          romaneioItens: {
            select: {
              id: true,
              qtd: true,
              romaneio: { select: { id: true, numero: true, data: true } },
            },
          },
        },
      },
    },
  });

  // Filtra apenas itens com categorias expedíveis
  const acessorios = [];
  for (const rm of rms) {
    for (const item of rm.itens) {
      const categoria = item.opItem?.categoria || item.aditivoItem?.categoria || "";
      if (!isExpedivel(categoria)) continue;

      const qtdExpedida = item.romaneioItens.reduce((s, ri) => s + (ri.qtd || 0), 0);
      acessorios.push({
        id: item.id,
        rmNumero: rm.numero,
        rmId: rm.id,
        descricao: item.descricao,
        categoria,
        unidade: item.unidade,
        qtdTotal: item.qtd,
        qtdExpedida,
        pesoKg: item.peso,
        statusCompra: item.status, // PENDENTE, EM_COTACAO, COTADO, PEDIDO_GERADO
        romaneioItens: item.romaneioItens,
      });
    }
  }

  const acessoriosResumo = {
    total: acessorios.length,
    expedidos: acessorios.filter((a) => a.qtdExpedida >= a.qtdTotal).length,
    parciais: acessorios.filter((a) => a.qtdExpedida > 0 && a.qtdExpedida < a.qtdTotal).length,
    pendentes: acessorios.filter((a) => a.qtdExpedida === 0).length,
  };

  // ─── 3. Romaneios da OP ───────────────────────────────────

  const romaneios = await prisma.romaneio.findMany({
    where: { opId },
    select: {
      id: true,
      numero: true,
      data: true,
      pesoRealKg: true,
      valorTotal: true,
      descricao: true,
    },
    orderBy: { data: "desc" },
  });

  const romaneiosResumo = {
    total: romaneios.length,
    pesoTotalKg: romaneios.reduce((s, r) => s + (r.pesoRealKg || 0), 0),
    valorTotal: romaneios.reduce((s, r) => s + (r.valorTotal || 0), 0),
  };

  // ─── Resposta ─────────────────────────────────────────────

  return NextResponse.json({
    success: true,
    op,
    pecas,
    pecasResumo,
    acessorios,
    acessoriosResumo,
    romaneios,
    romaneiosResumo,
  });
}
