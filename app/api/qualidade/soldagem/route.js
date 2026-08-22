// GET — soldadores e EPS, as duas listas que o ensaio visual de solda consulta.
//
// Uma rota só porque as duas são pedidas juntas, na mesma tela — duas chamadas do celular na
// fábrica é uma a mais do que precisa.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { listarSoldadores, listarEPS, epsDoProcesso } from "@/lib/soldagem";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try { await requireRole([...PERFIS_CAMPO, "ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const [soldadores, eps] = await Promise.all([
    listarSoldadores().catch(() => []),
    listarEPS().catch(() => []),
  ]);
  // ⚠ cada soldador já sai com as EPS dos processos em que É QUALIFICADO. É o que permite a tela
  // preencher a EPS sozinha quando só há uma, e impedir a escolha de uma EPS para a qual ele não
  // tem qualificação — que é o erro caro: junta soldada sob procedimento que o soldador não cobre.
  const comEPS = soldadores.map((s) => ({
    ...s,
    epsPermitidas: (s.processos || []).map((p) => epsDoProcesso(eps, p)?.codigo).filter(Boolean),
  }));

  return NextResponse.json({ soldadores: comEPS, eps });
}
