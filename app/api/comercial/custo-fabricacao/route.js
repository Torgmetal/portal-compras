// GET /api/comercial/custo-fabricacao → o custo de transformar um quilo, medido na empresa.
//
// ⚠ SÓ CUSTO. Imposto e BDI não entram aqui — Vitor (09/09/2026): "na parte de fabricação apenas
// os custos, e na aba de impostos e BDI você pega essas". Misturar faria a mesma grandeza aparecer
// em duas telas com números diferentes, que é como a tabela antiga se descolou da realidade.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { custoIndustrial } from "@/lib/custo-industrial";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const meses = Number(new URL(req.url).searchParams.get("meses")) || 12;
  const vida = Number(new URL(req.url).searchParams.get("vidaUtil")) || 10;
  try {
    const dados = await custoIndustrial({ meses, vidaUtilAnos: vida });
    return NextResponse.json({ success: true, dados });
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || "Falha ao calcular" }, { status: 500 });
  }
}
