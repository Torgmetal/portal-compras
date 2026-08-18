// CASAMENTO DE RASTREABILIDADE de uma OP — qual corrida/lote foi usada em cada peça.
// GET /api/qualidade/rastreio/097            → resumo da OP + todas as peças
// GET /api/qualidade/rastreio/097?marca=T97A1 → só aquela marca; se for CONJUNTO, devolve os
//                                               CROQUIS que o compõem, cada um com sua corrida.
// Fonte: LPC (demanda) × CMR (entradas) casados por perfil e pela data do corte no Syneco.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rastreioDaOp, rastreioDoConjunto } from "@/lib/rastreio-peca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE", "PCP", "PLANEJAMENTO", "PRODUCAO", "ENGENHARIA", "COMPRAS"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opNumero } = await params;
  const num = String(opNumero || "").trim();
  const op = await prisma.oP.findFirst({ where: { numero: num }, select: { id: true, numero: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const marca = new URL(req.url).searchParams.get("marca");
  if (marca) {
    const itens = await rastreioDoConjunto(op.numero, op.id, marca);
    return NextResponse.json({ opNumero: op.numero, marca, itens });
  }

  const { porMarca, resumo } = await rastreioDaOp(op.numero, op.id);
  return NextResponse.json({
    opNumero: op.numero, obra: op.obra, resumo,
    itens: [...porMarca.entries()].map(([m, v]) => ({ marca: m, ...v })).sort((a, b) => String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true })),
  });
}
