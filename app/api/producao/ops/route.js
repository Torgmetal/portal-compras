import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
export async function GET() {
  try {
    await requireRole([
      "ADMIN",
      "PRODUCAO",
      "PCP",
      "PLANEJAMENTO",
      "QUALIDADE",
      "EXPEDICAO",
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 403 },
    );
  }
  try {
    const ops = await prisma.oP.findMany({
      select: {
        id: true,
        numero: true,
        cliente: true,
        obra: true,
        status: true,
      },
      orderBy: { numero: "desc" },
    });
    return NextResponse.json(
      {
        ops: ops.map((o) => ({
          opId: o.id,
          opNumero: o.numero,
          cliente: o.cliente,
          obra: o.obra,
          status: o.status,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar as OPs cadastradas." },
      { status: 500 },
    );
  }
}
