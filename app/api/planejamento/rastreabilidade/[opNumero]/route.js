// Rastreabilidade do material de uma OP (o que abre ao clicar no status de compra):
// corrida/lote, certificado, NF, pedido de compra, fornecedor, data e peso — direto do CMR.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { rastreabilidadeDaOp, statusCompraPorOp } from "@/lib/status-compra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMPRAS", "QUALIDADE", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opNumero } = await params;
  const [linhas, st] = await Promise.all([
    rastreabilidadeDaOp(opNumero),
    statusCompraPorOp([opNumero]),
  ]);
  return NextResponse.json({ opNumero, compra: st.get(String(opNumero)) || null, linhas });
}
