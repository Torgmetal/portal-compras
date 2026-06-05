// GET /api/financeiro/pedidos-venda[?forcar=1]
// Lista os pedidos de venda (Medições) em aberto/atrasado do Omie, com o projeto (obra).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prismaDirect } from "@/lib/prisma";
import { listarPedidosVendaAbertos } from "@/lib/omie-pedidos-abertos";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  try {
    const data = await listarPedidosVendaAbertos(forcar);

    // Soma as NFS-e avulsas de Conchal vinculadas a cada obra (faturado fora do Omie)
    let avulsasPorObra = [];
    try {
      avulsasPorObra = await prismaDirect.nfseConchalVinculo.groupBy({
        by: ["codProj"], _sum: { valor: true }, _count: true,
      });
    } catch { /* tabela pode não existir em ambiente antigo — não fatal */ }

    if (avulsasPorObra.length) {
      const somaDe = new Map(avulsasPorObra.map(a => [String(a.codProj), { valor: a._sum.valor || 0, qtd: a._count }]));
      let totalAvulso = 0;
      const obras = (data.obras || []).map(o => {
        const av = somaDe.get(String(o.codProj));
        if (!av) return o;
        totalAvulso += av.valor;
        const faturado = o.faturado + av.valor;
        const total = faturado + o.aFaturar;
        return {
          ...o, faturado, total,
          faturadoAvulso: av.valor, qtdAvulsas: av.qtd,
          pctFaturado: total > 0 ? Math.round((faturado / total) * 100) : 0,
        };
      });
      data.obras = obras;
      data.totalFaturado = (data.totalFaturado || 0) + totalAvulso;
      data.totalContratado = (data.totalContratado || 0) + totalAvulso;
      data.totalFaturadoAvulso = totalAvulso;
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ error: "Falha ao consultar Omie: " + (e?.message || e) }, { status: 502 });
  }
}
