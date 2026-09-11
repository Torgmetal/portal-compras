// GET /api/pcp/lista-posto?setor=MONTAGEM&recurso=MONTAGEM%201&de=2026-09-08&ate=2026-09-14
// → o que está na mão daquele posto no período. Só lê.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { listaDoPosto, listaSemBancada } from "@/lib/lista-posto";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const setor = String(u.searchParams.get("setor") || "").trim().toUpperCase();
  const recurso = String(u.searchParams.get("recurso") || "").trim();
  const fila = u.searchParams.get("fila");
  if (fila && fila !== "sem-bancada") return NextResponse.json({error:"Fila inválida."},{status:400});
  const de = String(u.searchParams.get("de") || "").trim();
  const ate = String(u.searchParams.get("ate") || "").trim();
  if (!fila && (!DIA.test(de) || !DIA.test(ate))) return NextResponse.json({ error: "Período inválido." }, { status: 400 });

  try { return NextResponse.json(await (fila ? listaSemBancada(setor) : listaDoPosto(setor, recurso, de, ate))); }
  catch (e) { return NextResponse.json({ error: e.message || "Falha ao montar a lista" }, { status: 400 }); }
}
