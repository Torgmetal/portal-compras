import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/engenharia/op/[opNumero]
// Detalhamento de uma OP: marcas/conjuntos do snapshot Tekla (PecaConjunto),
// com resumo (peso modelado x produzido, qualidade do dado) + lista.
export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "ENGENHARIA"]);
    const { opNumero } = await params;

    // opNumero e o codigo Tekla/SKA; a OP real vem por opId (relacao `op`).
    const [rep, agg, marcas] = await Promise.all([
      prisma.pecaConjunto.findFirst({
        where: { opNumero },
        select: { op: { select: { numero: true, cliente: true, obra: true, status: true, valorTotalContrato: true } } },
      }),
      prisma.pecaConjunto.aggregate({
        where: { opNumero },
        _sum: { pesoTotalKg: true, pesoProduzido: true, qte: true, qteProduzida: true, areaPinturaM2: true },
        _count: { _all: true },
      }),
      prisma.pecaConjunto.findMany({
        where: { opNumero },
        orderBy: [{ pesoTotalKg: "desc" }],
        take: 3000,
        select: {
          id: true, marca: true, descricao: true, tipoPeca: true, material: true, perfil: true,
          comprimentoMm: true, qte: true, pesoUnitKg: true, pesoTotalKg: true, areaPinturaM2: true,
          status: true, maquina: true, statusEstoque: true, terceirizado: true,
          qteProduzida: true, pesoProduzido: true,
        },
      }),
    ]);

    if (agg._count._all === 0) {
      return NextResponse.json({ success: false, error: "Nenhuma marca importada para esta OP" }, { status: 404 });
    }

    // Distribuição por status (funil de produção)
    const porStatus = await prisma.pecaConjunto.groupBy({
      by: ["status"], where: { opNumero }, _count: { _all: true }, _sum: { pesoTotalKg: true },
    });

    // Qualidade do dado: marcas sem material (grade) ou sem perfil
    const semGrade = marcas.filter((m) => !m.material || !m.material.trim()).length;
    const semPerfil = marcas.filter((m) => !m.perfil || !m.perfil.trim()).length;

    const pesoModeladoKg = Math.round(agg._sum.pesoTotalKg || 0);
    const pesoProduzidoKg = Math.round(agg._sum.pesoProduzido || 0);

    const op = rep?.op || null;
    return NextResponse.json({
      success: true,
      op: { opNumero, numero: op?.numero || null, cliente: op?.cliente || null, obra: op?.obra || null, status: op?.status || null, valorTotalContrato: op?.valorTotalContrato || null, semOp: !op },
      resumo: {
        nMarcas: agg._count._all,
        nConjuntos: marcas.filter((m) => m.tipoPeca === "CONJUNTO").length,
        nCroquis: marcas.filter((m) => m.tipoPeca === "CROQUI").length,
        qteTotal: agg._sum.qte || 0,
        pesoModeladoKg,
        pesoProduzidoKg,
        pct: pesoModeladoKg > 0 ? Math.round((pesoProduzidoKg / pesoModeladoKg) * 1000) / 10 : 0,
        areaPinturaM2: Math.round(agg._sum.areaPinturaM2 || 0),
        semGrade,
        semPerfil,
        truncado: agg._count._all > marcas.length,
      },
      porStatus: porStatus.map((s) => ({ status: s.status, n: s._count._all, pesoKg: Math.round(s._sum.pesoTotalKg || 0) })).sort((a, b) => b.pesoKg - a.pesoKg),
      marcas,
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
