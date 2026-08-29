// GET /api/engenharia/sequencia/impacto?setor=ENGENHARIA
//
// O que as esperas do setor empurrariam no cronograma — SEM empurrar nada.
//
// ⚠⚠ SÓ CALCULA. Vitor (29/08/2026): "vamos no ponto 2; se caso avaliarmos ser necessário passarmos
// para o cronograma, aí atualizamos depois". Aplicar o deslocamento atravessa três setores (na TMSA
// uma revisão parada na Engenharia move Preparação, Montagem, Solda, Pintura e Expedição), e essa
// decisão é do Planejamento — não pode acontecer sozinha e ser descoberta na segunda-feira.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { impactoDasEsperas } from "@/lib/espera-cronograma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const setor = new URL(req.url).searchParams.get("setor") || "ENGENHARIA";
  const impacto = await impactoDasEsperas(setor);
  return NextResponse.json({
    success: true, setor, impacto,
    totalObras: impacto.length,
    totalTarefas: impacto.reduce((s, i) => s + i.tarefasMovidas, 0),
  });
}
