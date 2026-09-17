// GET /api/producao/apontamentos-syneco?opId=…&setor=… → o que falta lançar no Syneco, por DUAS
// origens, que viram duas abas da planilha:
//   1. `linhas`        — o portal deu baixa e o Syneco ainda não tem (lib/apontamentos-syneco.js)
//   2. `etapaAnterior` — a peça está apontada à FRENTE, então os setores atrás precisam de baixa
//                        (lib/baixa-etapa-anterior.js). Vitor (17/09/2026): "se a peça estava
//                        apontada na pintura já indicava que tinha que dar baixa nos setores
//                        anteriores que não foram dado baixa".
// Sem filtros: todas as OPs vivas, todos os setores.
// ⚠ Só lê. Quem lança é a pessoa, no Syneco.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { apontamentosParaSyneco, NOME_SYNECO } from "@/lib/apontamentos-syneco";
import { baixasDeEtapaAnterior } from "@/lib/baixa-etapa-anterior";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const u = new URL(req.url);
  const opId = u.searchParams.get("opId") || null, setor = u.searchParams.get("setor") || null;
  try {
    const setorSyneco = setor ? NOME_SYNECO[String(setor).toUpperCase()] || null : null;
    const [portal, atras] = await Promise.all([
      apontamentosParaSyneco({ opId, setor }),
      baixasDeEtapaAnterior({ opId, setorSyneco }),
    ]);
    return NextResponse.json({ success: true, ...portal, etapaAnterior: atras });
  }
  catch (e) { return NextResponse.json({ error: e.message || "Falha ao montar a lista" }, { status: 400 }); }
}
