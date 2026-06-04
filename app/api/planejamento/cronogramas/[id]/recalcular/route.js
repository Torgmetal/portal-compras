import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { recalcularCronograma } from "@/lib/cronograma-recalcular";

export const runtime = "nodejs";
export const maxDuration = 15;

// POST /api/planejamento/cronogramas/[id]/recalcular
// Recalcula datas do cronograma baseado nas dependencias (antecessoras).
export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;

  const { updates, alteracoes, error } = await recalcularCronograma(id, user.id);

  if (error) {
    return NextResponse.json({ success: false, error }, { status: 400 });
  }

  if (updates.length === 0) {
    return NextResponse.json({
      success: true,
      message: "Nenhuma data precisou ser ajustada.",
      alteracoes: 0,
    });
  }

  return NextResponse.json({
    success: true,
    message: `${updates.length} tarefa${updates.length > 1 ? "s" : ""} ajustada${updates.length > 1 ? "s" : ""}.`,
    alteracoes: updates.length,
    detalhes: alteracoes,
  });
}
