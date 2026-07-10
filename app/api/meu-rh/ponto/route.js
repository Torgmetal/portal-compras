// GET /api/meu-rh/ponto — cartões de ponto (PDF) do funcionário logado, por
// competência. O funcionário só vê e baixa o PDF (a página dele), igual holerite.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFuncionario } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  let user;
  try {
    user = await requireFuncionario();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const itens = await prisma.pontoItem.findMany({
    where: { funcionarioId: user.funcionarioId, pdfUrl: { not: null } },
    select: { id: true, empresa: true, ponto: { select: { competencia: true } } },
    orderBy: { ponto: { competencia: "desc" } },
  });

  const cartoes = itens.map((i) => ({
    id: i.id,
    competencia: i.ponto?.competencia || null,
    empresa: i.empresa,
  }));

  return NextResponse.json({ cartoes });
}
