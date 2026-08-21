// GET — as OPs abertas, para o seletor do celular.
//
// 🚫 SÓ O NÚMERO. Vitor (21/08/2026): "pode deixar aberto, só não deixa o nome do cliente; para
// esse acesso deixar apenas o número da OP". Dois dos cinco usuários são inspetores EXTERNOS —
// devolver cliente e obra entregaria a carteira de obras da Torg a quem só precisa saber em qual
// OP está fotografando.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ops = await prisma.oP.findMany({
    // encerrada e cancelada ficam de fora: obra entregue não recebe inspeção nova
    where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] } },
    select: { id: true, numero: true },
    orderBy: { numero: "desc" },
    take: 300,
  });

  return NextResponse.json({ ops });
}
