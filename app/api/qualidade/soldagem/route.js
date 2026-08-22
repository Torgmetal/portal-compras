// GET — soldadores e EPS, as duas listas que o ensaio visual de solda consulta.
//
// Uma rota só porque as duas são pedidas juntas, na mesma tela — duas chamadas do celular na
// fábrica é uma a mais do que precisa.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { listarSoldadores, listarEPS } from "@/lib/soldagem";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try { await requireRole([...PERFIS_CAMPO, "ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const [soldadores, eps] = await Promise.all([
    listarSoldadores().catch(() => []),
    listarEPS().catch(() => []),
  ]);
  return NextResponse.json({ soldadores, eps });
}
