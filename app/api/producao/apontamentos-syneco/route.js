// GET /api/producao/apontamentos-syneco?opId=…&setor=… → o que o portal deu baixa e o Syneco ainda não tem,
// por marca e setor (a planilha de correção). Sem filtros: todas as OPs vivas, todos os setores.
// ⚠ Só lê. Quem lança é a pessoa, no Syneco — ver lib/apontamentos-syneco.js.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { apontamentosParaSyneco } from "@/lib/apontamentos-syneco";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const u = new URL(req.url);
  const opId = u.searchParams.get("opId") || null, setor = u.searchParams.get("setor") || null;
  try { return NextResponse.json({ success: true, ...(await apontamentosParaSyneco({ opId, setor })) }); }
  catch (e) { return NextResponse.json({ error: e.message || "Falha ao montar a lista" }, { status: 400 }); }
}
