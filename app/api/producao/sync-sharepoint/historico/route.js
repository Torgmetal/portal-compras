// Lista as ultimas execucoes do sync do SharePoint pra mostrar na UI.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const syncs = await prisma.sharepointSync.findMany({
    where: { tipo: "PCP_PRODUCAO" },
    orderBy: { criadoEm: "desc" },
    take: 10,
    include: { executadoPor: { select: { name: true, email: true } } },
  });
  return NextResponse.json({ syncs });
}
