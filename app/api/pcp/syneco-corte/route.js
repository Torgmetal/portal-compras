// GET /api/pcp/syneco-corte            → resumo por obra das ordens de corte
//                                        ABERTAS no Syneco (Não Inicializada /
//                                        Produzindo / Finalizada Parcial)
// GET /api/pcp/syneco-corte?obra=T85   → itens abertos dessa obra
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 30;

const STATUS_ABERTOS = ["Não Inicializada", "Produzindo", "Finalizada Parcial"];

export async function GET(req) {
  try {
    // superset dos perfis das duas páginas que usam a tela (PCP e Produção)
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const { searchParams } = new URL(req.url);
  const obra = searchParams.get("obra");

  try {
    if (!obra) {
      const grupos = await prisma.mesOrdem.groupBy({
        by: ["obra"],
        where: { setor: { contains: "Corte", mode: "insensitive" }, status: { in: STATUS_ABERTOS } },
        _count: { id: true },
        _sum: { planejadoUn: true, saldoUn: true, pesoPlanejado: true, saldoRestante: true },
      });
      const resumo = grupos
        .map((g) => ({
          obra: g.obra,
          itens: g._count.id,
          planejadoUn: g._sum.planejadoUn || 0,
          saldoUn: g._sum.saldoUn || 0,
          pesoPlanejado: g._sum.pesoPlanejado || 0,
          saldoRestante: g._sum.saldoRestante || 0,
        }))
        .sort((a, b) => b.pesoPlanejado - a.pesoPlanejado);
      return NextResponse.json({ resumo });
    }

    const itens = await prisma.mesOrdem.findMany({
      where: { setor: { contains: "Corte", mode: "insensitive" }, obra, status: { in: STATUS_ABERTOS } },
      select: {
        id: true, obra: true, op: true, item: true, descItem: true, maquina: true,
        status: true, planejadoUn: true, produzidoUn: true, saldoUn: true,
        pesoPlanejado: true, saldoRestante: true, dataInicio: true,
      },
      orderBy: [{ item: "asc" }],
      take: 1500,
    });
    return NextResponse.json({ itens });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro interno" }, { status: 500 });
  }
}
