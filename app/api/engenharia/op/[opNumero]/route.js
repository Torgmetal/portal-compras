import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { pecasTekla } from "@/lib/peso-op";

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
    // `todas` = conjunto leve pra o cálculo canônico (sem dobra); `marcas` = lista de exibição.
    const [rep, todas, marcas] = await Promise.all([
      prisma.pecaConjunto.findFirst({
        where: { opNumero },
        select: { op: { select: { numero: true, cliente: true, obra: true, status: true, valorTotalContrato: true } } },
      }),
      prisma.pecaConjunto.findMany({
        where: { opNumero },
        select: { fonte: true, tipoPeca: true, pesoTotalKg: true, pesoProduzido: true, qte: true, areaPinturaM2: true, status: true },
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

    if (todas.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhuma marca importada para esta OP" }, { status: 404 });
    }

    // Peso modelado/produzido do conjunto Tekla (pecasTekla) — sem dobrar croqui/LE. Ver peso-op.js.
    const tekla = pecasTekla(todas);
    const pesoModeladoKg = Math.round(tekla.reduce((s, p) => s + (p.pesoTotalKg || 0), 0));
    const pesoProduzidoKg = Math.round(tekla.reduce((s, p) => s + (p.pesoProduzido || 0), 0));

    // Funil por status — sobre o conjunto Tekla (senão croqui/LE dobram o peso por etapa).
    const statusMap = new Map();
    for (const p of tekla) { const k = p.status || "—"; const e = statusMap.get(k) || { status: k, n: 0, pesoKg: 0 }; e.n += 1; e.pesoKg += p.pesoTotalKg || 0; statusMap.set(k, e); }
    const porStatus = [...statusMap.values()].map((s) => ({ ...s, pesoKg: Math.round(s.pesoKg) })).sort((a, b) => b.pesoKg - a.pesoKg);

    // Qualidade do dado: marcas sem material (grade) ou sem perfil
    const semGrade = marcas.filter((m) => !m.material || !m.material.trim()).length;
    const semPerfil = marcas.filter((m) => !m.perfil || !m.perfil.trim()).length;

    const op = rep?.op || null;
    return NextResponse.json({
      success: true,
      op: { opNumero, numero: op?.numero || null, cliente: op?.cliente || null, obra: op?.obra || null, status: op?.status || null, valorTotalContrato: op?.valorTotalContrato || null, semOp: !op },
      resumo: {
        nMarcas: tekla.length,
        nConjuntos: tekla.filter((m) => m.tipoPeca === "CONJUNTO").length,
        nCroquis: todas.filter((m) => m.tipoPeca === "CROQUI").length,
        qteTotal: tekla.reduce((s, p) => s + (p.qte || 0), 0),
        pesoModeladoKg,
        pesoProduzidoKg,
        pct: pesoModeladoKg > 0 ? Math.round((pesoProduzidoKg / pesoModeladoKg) * 1000) / 10 : 0,
        areaPinturaM2: Math.round(tekla.reduce((s, p) => s + (p.areaPinturaM2 || 0), 0)),
        semGrade,
        semPerfil,
        truncado: todas.length > marcas.length,
      },
      porStatus,
      marcas,
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
