// GET /api/compras/fornecedores/iqf?ano= — Avaliação automática de fornecedores (IQF).
// Nota por fornecedor tirada da rotina de compras (resposta + entrega + qualidade).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcularIQF } from "@/lib/iqf-fornecedores";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMPRAS"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const hoje = new Date();
  const ano = parseInt(new URL(req.url).searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  try {
    const { fornecedores, pesos } = await calcularIQF(prisma, { yIni, yFim });
    return NextResponse.json({ ano, fornecedores, pesos });
  } catch (e) { return NextResponse.json({ error: "Falha ao calcular o IQF: " + (e?.message || "erro") }, { status: 500 }); }
}
