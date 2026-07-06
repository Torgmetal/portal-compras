// GET /api/meu-rh/ferias
// Autoatendimento do funcionário: suas férias programadas/gozadas (exceto
// canceladas) com período, dias e o valor estimado que o RH lançou, mais o
// período aquisitivo atual (para ele saber quando tem direito).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFuncionario } from "@/lib/session";
import { periodoAtual } from "@/lib/ferias-calc";

export const runtime = "nodejs";

export async function GET() {
  let user;
  try {
    user = await requireFuncionario();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const func = await prisma.funcionario.findUnique({
    where: { id: user.funcionarioId },
    select: {
      dataAdmissao: true,
      ferias: {
        where: { status: { not: "CANCELADA" } },
        orderBy: { dataInicio: "asc" },
        select: {
          id: true, dataInicio: true, dataFim: true,
          diasGozo: true, diasVendidos: true, valorEstimado: true, status: true,
        },
      },
    },
  });
  if (!func) return NextResponse.json({ error: "Funcionário não encontrado" }, { status: 404 });

  // Período aquisitivo atual (admissão + nº de férias já usadas).
  const periodo = periodoAtual(func.dataAdmissao, func.ferias.length);

  return NextResponse.json({ ferias: func.ferias, periodo });
}
