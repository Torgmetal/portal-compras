// GET /api/diretoria/saldo-contratos — saldo a faturar dos contratos no Omie
// (pedidos de VENDA + ordens de SERVIÇO), por obra. É o norte do "a receber":
// o que ainda há para faturar/receber das medições em aberto. Gate requireDiretoria.
import { NextResponse } from "next/server";
import { requireDiretoria } from "@/lib/diretoria";
import { listarPedidosVendaAbertos } from "@/lib/omie-pedidos-abertos";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  try {
    const d = await listarPedidosVendaAbertos(forcar);
    const obras = (d.obras || [])
      .filter((o) => o.aFaturar > 0.5 || o.faturado > 0.5)
      .map((o) => ({
        numeroOp: o.numeroOp, projeto: o.projeto, tipo: o.tipo,
        faturado: o.faturado, aFaturar: o.aFaturar, total: o.total,
        pctFaturado: o.pctFaturado, atrasado: o.atrasado,
      }))
      .sort((a, b) => b.aFaturar - a.aFaturar);
    return NextResponse.json({
      totalAFaturar: d.totalAFaturar, totalFaturado: d.totalFaturado, totalContratado: d.totalContratado,
      totalObras: d.totalObras, obrasComAtraso: d.obrasComAtraso,
      atualizadoEm: d.atualizadoEm, doCache: d.doCache || false, avisoOmie: d.avisoOmie || null,
      obras,
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Erro ao consultar o Omie" }, { status: 502 });
  }
}
