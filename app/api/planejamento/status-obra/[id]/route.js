// GET /api/planejamento/status-obra/[id] — detalhe de uma lista (com as marcas)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "ENGENHARIA", "EXPEDICAO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const lista = await prisma.listaExpedicao.findUnique({ where: { id: params.id } });
  if (!lista) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  return NextResponse.json({ lista });
}
