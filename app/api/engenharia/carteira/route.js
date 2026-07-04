import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/engenharia/carteira
// Carteira de Engenharia: uma linha por OP com marcas modeladas (Tekla/LPC ->
// PecaConjunto), peso modelado (kg), peso produzido (Syneco) e progresso.
export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET() {
  try {
    await requireRole(["ADMIN", "ENGENHARIA"]);

    // Agrega as marcas por OP (uma unica query)
    const grupos = await prisma.pecaConjunto.groupBy({
      by: ["opNumero"],
      _sum: { pesoTotalKg: true, pesoProduzido: true, qte: true, qteProduzida: true },
      _count: { _all: true },
      _max: { atualizadoEm: true },
    });

    // Dados das OPs correspondentes.
    // ⚠️ PecaConjunto.opNumero e o codigo Tekla/SKA (ex.: T64T), NAO o OP.numero
    // (ex.: 067). A OP real vem por opId (relacao `op`). Pega 1 representante por
    // opNumero e resolve a OP pela relacao. Ver memoria torg_pecaconjunto_opnumero.
    const opNumeros = grupos.map((g) => g.opNumero).filter(Boolean);
    const reps = await prisma.pecaConjunto.findMany({
      where: { opNumero: { in: opNumeros } },
      distinct: ["opNumero"],
      select: { opNumero: true, op: { select: { numero: true, cliente: true, obra: true, status: true, valorTotalContrato: true } } },
    });
    const opMap = new Map(reps.map((r) => [r.opNumero, r.op]));

    // Quantos conjuntos (tipoPeca=CONJUNTO) por OP — 2ª query leve
    const conj = await prisma.pecaConjunto.groupBy({
      by: ["opNumero"],
      where: { tipoPeca: "CONJUNTO" },
      _count: { _all: true },
    });
    const conjMap = new Map(conj.map((c) => [c.opNumero, c._count._all]));

    const obras = grupos.map((g) => {
      const op = opMap.get(g.opNumero) || null;
      const pesoModeladoKg = Math.round(g._sum.pesoTotalKg || 0);
      const pesoProduzidoKg = Math.round(g._sum.pesoProduzido || 0);
      const pct = pesoModeladoKg > 0 ? Math.round((pesoProduzidoKg / pesoModeladoKg) * 1000) / 10 : 0;
      return {
        opNumero: g.opNumero, // codigo Tekla/SKA (frente)
        opReal: op?.numero || null, // OP.numero real (via opId)
        cliente: op?.cliente || null,
        obra: op?.obra || null,
        status: op?.status || null,
        semOp: !op, // marca no Tekla sem OP cadastrada no portal
        nMarcas: g._count._all,
        nConjuntos: conjMap.get(g.opNumero) || 0,
        qteTotal: g._sum.qte || 0,
        pesoModeladoKg,
        pesoProduzidoKg,
        pct,
        atualizadoEm: g._max.atualizadoEm,
        valorTotalContrato: op?.valorTotalContrato || null,
      };
    });

    // Ordena por peso modelado (maiores obras primeiro)
    obras.sort((a, b) => b.pesoModeladoKg - a.pesoModeladoKg);

    const resumo = {
      nOPs: obras.length,
      pesoModeladoKg: obras.reduce((s, o) => s + o.pesoModeladoKg, 0),
      pesoProduzidoKg: obras.reduce((s, o) => s + o.pesoProduzidoKg, 0),
      nMarcas: obras.reduce((s, o) => s + o.nMarcas, 0),
    };
    resumo.pct = resumo.pesoModeladoKg > 0 ? Math.round((resumo.pesoProduzidoKg / resumo.pesoModeladoKg) * 1000) / 10 : 0;

    return NextResponse.json({ success: true, resumo, obras });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
