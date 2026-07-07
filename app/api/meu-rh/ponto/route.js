// GET /api/meu-rh/ponto — espelho de ponto do funcionário logado (totais por
// faixa + dia a dia, igual o cartão). Traz as competências já importadas.
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
    where: { funcionarioId: user.funcionarioId, diario: { not: null } },
    select: { id: true, empresa: true, diario: true, ponto: { select: { competencia: true } } },
    orderBy: { ponto: { competencia: "desc" } },
  });

  const competencias = itens.map((i) => ({
    id: i.id,
    competencia: i.ponto?.competencia || null,
    empresa: i.empresa,
    ...i.diario, // { totais, dias, periodoInicio, periodoFim, folha }
  }));

  return NextResponse.json({ competencias });
}
