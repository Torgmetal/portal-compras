import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { pecasTekla } from "@/lib/peso-op";

// GET /api/engenharia/carteira
// Carteira de Engenharia: uma linha por OP com marcas modeladas (Tekla/LPC ->
// PecaConjunto), peso modelado (kg), peso produzido (Syneco) e progresso.
export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET() {
  try {
    await requireRole(["ADMIN", "ENGENHARIA"]);

    // Carrega as marcas e agrupa por opNumero em memória — o peso modelado sai do
    // conjunto Tekla (pecasTekla) pra NÃO dobrar (croqui = detalhe do conjunto; LE = a
    // mesma estrutura). Somar o pesoTotalKg cru dobrava a carteira (~2×). Ver peso-op.js.
    const pecas = await prisma.pecaConjunto.findMany({
      select: { opNumero: true, fonte: true, tipoPeca: true, pesoTotalKg: true, pesoProduzido: true, qte: true, qteProduzida: true, atualizadoEm: true },
    });
    const porOp = new Map();
    for (const p of pecas) { if (!p.opNumero) continue; const a = porOp.get(p.opNumero); if (a) a.push(p); else porOp.set(p.opNumero, [p]); }

    // Dados das OPs correspondentes.
    // ⚠️ PecaConjunto.opNumero e o codigo Tekla/SKA (ex.: T64T), NAO o OP.numero
    // (ex.: 067). A OP real vem por opId (relacao `op`). Pega 1 representante por
    // opNumero e resolve a OP pela relacao. Ver memoria torg_pecaconjunto_opnumero.
    const opNumeros = [...porOp.keys()];
    const reps = await prisma.pecaConjunto.findMany({
      where: { opNumero: { in: opNumeros } },
      distinct: ["opNumero"],
      select: { opNumero: true, op: { select: { numero: true, cliente: true, obra: true, status: true, valorTotalContrato: true } } },
    });
    const opMap = new Map(reps.map((r) => [r.opNumero, r.op]));

    const obras = opNumeros.map((opNumero) => {
      const todas = porOp.get(opNumero);
      const tekla = pecasTekla(todas); // conjunto canônico (sem dobra)
      const op = opMap.get(opNumero) || null;
      const pesoModeladoKg = Math.round(tekla.reduce((s, p) => s + (p.pesoTotalKg || 0), 0));
      const pesoProduzidoKg = Math.round(tekla.reduce((s, p) => s + (p.pesoProduzido || 0), 0));
      const pct = pesoModeladoKg > 0 ? Math.round((pesoProduzidoKg / pesoModeladoKg) * 1000) / 10 : 0;
      return {
        opNumero, // codigo Tekla/SKA (frente)
        opReal: op?.numero || null, // OP.numero real (via opId)
        cliente: op?.cliente || null,
        obra: op?.obra || null,
        status: op?.status || null,
        semOp: !op, // marca no Tekla sem OP cadastrada no portal
        nMarcas: tekla.length,
        nConjuntos: tekla.filter((p) => p.tipoPeca === "CONJUNTO").length,
        qteTotal: tekla.reduce((s, p) => s + (p.qte || 0), 0),
        pesoModeladoKg,
        pesoProduzidoKg,
        pct,
        atualizadoEm: todas.reduce((mx, p) => (p.atualizadoEm > mx ? p.atualizadoEm : mx), todas[0]?.atualizadoEm || null),
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
