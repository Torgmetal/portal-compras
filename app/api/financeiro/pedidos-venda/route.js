// GET /api/financeiro/pedidos-venda[?forcar=1]
// Lista os pedidos de venda (Medições) em aberto/atrasado do Omie, com o projeto (obra).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
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
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ error: "Falha ao consultar Omie: " + (e?.message || e) }, { status: 502 });
  }
}
