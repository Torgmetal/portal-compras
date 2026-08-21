// GET — OPs para o seletor da Qualidade (com cliente e obra; aqui não vale a regra do portal de
// campo, que esconde o cliente porque tem inspetor externo).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ops = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
    orderBy: { numero: "desc" },
    take: 300,
  });
  return NextResponse.json({ ops });
}
