// GET /api/meu-rh/mural — avisos ativos do mural, para o funcionário logado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFuncionario } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try { await requireFuncionario(); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const avisos = await prisma.muralAviso.findMany({
    where: { ativo: true },
    orderBy: [{ fixado: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: { id: true, titulo: true, corpo: true, fixado: true, criadoPorNome: true, createdAt: true },
  });
  return NextResponse.json({ success: true, avisos });
}
