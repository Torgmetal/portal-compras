import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 30;

/**
 * GET /api/expedicao/programacao-cargas
 * Retorna visao consolidada de todas as cargas programadas (cross-OP)
 * e progresso de expedicao por OP com alertas.
 */
export async function GET() {
  try {
    await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  try {
    const agora = new Date();

    const [cargas, opsRaw] = await Promise.all([
      // 1. Todas as cargas planejadas (com itens e info da OP)
      prisma.planejamentoCarga.findMany({
        orderBy: { dataPrevista: "asc" },
        include: {
          op: { select: { id: true, numero: true, cliente: true, obra: true } },
          itens: {
            select: {
              id: true, tipo: true, descricao: true, status: true,
              qtdPlanejada: true, qtdCarregada: true, pesoEstimadoKg: true,
              motivoNaoEnvio: true,
              pecaConjunto: { select: { id: true, marca: true, status: true } },
            },
          },
          romaneio: { select: { id: true, numero: true, data: true, pesoRealKg: true } },
        },
      }),

      // 2. OPs ativas com pecas e seus vinculos a cargas
      prisma.oP.findMany({
        where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
        select: {
          id: true, numero: true, cliente: true, obra: true,
          pecasConjunto: {
            select: {
              id: true, marca: true, descricao: true, qte: true,
              pesoTotalKg: true, status: true,
              planejamentoCargaItens: { select: { id: true } },
              romaneioItens: { select: { qtd: true } },
            },
          },
        },
        orderBy: { numero: "desc" },
      }),
    ]);

    // ─── Processa cargas ───────────────────────────────────────
    const cargasFormatadas = cargas.map((c) => ({
      id: c.id,
      opId: c.op.id,
      opNumero: c.op.numero,
      cliente: c.op.cliente,
      obra: c.op.obra,
      dataPrevista: c.dataPrevista,
      descricao: c.descricao,
      status: c.status,
      romaneio: c.romaneio ? { numero: c.romaneio.numero, data: c.romaneio.data, pesoRealKg: c.romaneio.pesoRealKg } : null,
      totalItens: c.itens.length,
      pesoEstimadoKg: c.itens.reduce((s, i) => s + (i.pesoEstimadoKg || 0), 0),
      carregados: c.itens.filter((i) => i.status === "CARREGADO").length,
      naoEnviados: c.itens.filter((i) => i.status === "NAO_ENVIADO").length,
      vencida: c.status === "PLANEJADO" && new Date(c.dataPrevista) < agora,
      itens: c.itens,
      createdAt: c.createdAt,
    }));

    // ─── Processa progresso por OP ─────────────────────────────
    // Status de producao "prontos pra expedir": PINTURA concluida
    // JATO e PINTURA = em processo, quase prontos
    // Antes de JATO = bloqueado
    const PRONTOS_EXPEDIR = new Set(["PINTURA", "EXPEDIDO"]);
    const EM_PROCESSO = new Set(["JATO"]);

    const progressoOPs = [];
    const pecasEsquecidas = [];

    for (const op of opsRaw) {
      const pecas = op.pecasConjunto;
      const total = pecas.length;
      if (total === 0) continue;

      const expedidas = pecas.filter((p) => p.status === "EXPEDIDO").length;
      const prontas = pecas.filter((p) => PRONTOS_EXPEDIR.has(p.status) && p.status !== "EXPEDIDO");
      const emProcesso = pecas.filter((p) => EM_PROCESSO.has(p.status));

      // Pecas prontas (Pintura) sem nenhuma carga planejada
      const prontasSemCarga = prontas.filter((p) => p.planejamentoCargaItens.length === 0);

      // Pecas em Jato sem carga
      const jatoSemCarga = emProcesso.filter((p) => p.planejamentoCargaItens.length === 0);

      if (prontasSemCarga.length > 0) {
        pecasEsquecidas.push({
          opId: op.id,
          opNumero: op.numero,
          cliente: op.cliente,
          obra: op.obra,
          pecas: prontasSemCarga.map((p) => ({
            id: p.id, marca: p.marca, descricao: p.descricao,
            pesoTotalKg: p.pesoTotalKg, status: p.status,
          })),
        });
      }

      const pesoTotal = pecas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
      const pesoExpedido = pecas.filter((p) => p.status === "EXPEDIDO").reduce((s, p) => s + (p.pesoTotalKg || 0), 0);

      progressoOPs.push({
        id: op.id,
        numero: op.numero,
        cliente: op.cliente,
        obra: op.obra,
        totalPecas: total,
        pecasExpedidas: expedidas,
        pecasProntas: prontas.length,
        pecasEmProcesso: emProcesso.length,
        pecasProntasSemCarga: prontasSemCarga.length,
        pecasJatoSemCarga: jatoSemCarga.length,
        pesoTotalKg: pesoTotal,
        pesoExpedidoKg: pesoExpedido,
        pctExpedido: total > 0 ? Math.round((expedidas / total) * 100) : 0,
      });
    }

    // Ordena: OPs com pecas esquecidas primeiro, depois por % expedido
    progressoOPs.sort((a, b) => {
      if (a.pecasProntasSemCarga > 0 && b.pecasProntasSemCarga === 0) return -1;
      if (a.pecasProntasSemCarga === 0 && b.pecasProntasSemCarga > 0) return 1;
      return a.pctExpedido - b.pctExpedido;
    });

    // ─── Resumo de alertas ─────────────────────────────────────
    const totalEsquecidas = pecasEsquecidas.reduce((s, o) => s + o.pecas.length, 0);
    const cargasVencidas = cargasFormatadas.filter((c) => c.vencida).length;
    const cargasPendentes = cargasFormatadas.filter((c) => c.status === "PLANEJADO").length;
    const cargasConcluidas = cargasFormatadas.filter((c) => c.status === "CONCLUIDO").length;

    return NextResponse.json({
      success: true,
      cargas: cargasFormatadas,
      progressoOPs,
      alertas: {
        pecasEsquecidas,
        totalEsquecidas,
        cargasVencidas,
        cargasPendentes,
        cargasConcluidas,
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message || "Erro interno" }, { status: 500 });
  }
}
