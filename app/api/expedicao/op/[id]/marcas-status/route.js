// POST /api/expedicao/op/[id]/marcas-status  { marcas: string[] }
// Para cada marca, devolve por quais setores do Syneco (mesOrdem) a peça já
// passou (produzido > 0) — ajuda a Expedição a ver o que já está produzido
// (montagem/solda/etc.) antes de montar a carga.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { normalizeSetorSyneco } from "@/lib/syneco-dia";

export const runtime = "nodejs";
export const maxDuration = 30;

const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"];
const FLUXO = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];

export async function POST(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const marks = [...new Set((body.marcas || []).map((m) => String(m || "").trim().toUpperCase()).filter(Boolean))];
  if (!marks.length) return NextResponse.json({ status: {} });

  const rows = await prisma.mesOrdem.findMany({
    where: { op: { in: marks } },
    select: { op: true, setor: true, produzidoUn: true },
  });

  // marca(UP) -> { CANON: produzidoSomado }
  const map = {};
  for (const r of rows) {
    const canon = normalizeSetorSyneco(r.setor);
    if (!FLUXO.includes(canon)) continue;
    const key = String(r.op).toUpperCase();
    (map[key] || (map[key] = {}))[canon] = (map[key][canon] || 0) + (r.produzidoUn || 0);
  }

  const status = {};
  for (const key of marks) {
    const e = map[key];
    if (!e) { status[key] = { encontrado: false, setores: {}, ultimo: null }; continue; }
    const setores = {};
    let ultimo = null;
    for (const s of FLUXO) { const feito = (e[s] || 0) > 0; setores[s] = feito; if (feito) ultimo = s; }
    status[key] = { encontrado: true, setores, ultimo };
  }
  return NextResponse.json({ status });
}
