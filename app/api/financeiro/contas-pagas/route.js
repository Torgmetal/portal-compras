// GET /api/financeiro/contas-pagas?de=YYYY-MM-DD&ate=YYYY-MM-DD
// Títulos de contas a pagar PAGOS no período (pela data de pagamento/baixa).
// A data da baixa vem ao vivo do Omie (PesquisarLancamentos) com cache de 60s;
// fornecedor/categoria/NF vêm do espelho local ContaPagar.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { listarContasPagas } from "@/lib/omie-contas-pagas";
import { hojeBRT } from "@/lib/data-br";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const sp = new URL(req.url).searchParams;
  const hoje = hojeBRT();
  const de = DATA_RE.test(sp.get("de") || "") ? sp.get("de") : hoje;
  const ate = DATA_RE.test(sp.get("ate") || "") ? sp.get("ate") : hoje;
  if (de > ate) {
    return NextResponse.json({ error: "Período inválido (início depois do fim)." }, { status: 400 });
  }

  try {
    const data = await listarContasPagas({ de, ate });
    return NextResponse.json({ ...data, de, ate });
  } catch (e) {
    return NextResponse.json({ error: "Falha ao consultar o Omie: " + e.message }, { status: 502 });
  }
}
