// GET /api/engenharia/grd — as GRDs da Engenharia agrupadas POR OP.
//
// Vitor (31/08/2026): "hoje não separamos por OP e sim por ordem numérica (…) no portal vc separe
// igual estamos fazendo na aba de GRD do PCP, por OP".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const grds = await prisma.grdEngenharia.findMany({
    orderBy: [{ data: "desc" }, { numero: "desc" }],
    select: {
      id: true, numero: true, numeroCabecalho: true, revisao: true, arquivo: true, data: true, para: true,
      referencia: true, opCodigo: true, opNumero: true, pesoKg: true, area: true,
      emitidoPor: true, qtdDocs: true, itens: true,
    },
  });

  // ⚠ A REVISÃO ATUAL É O QUE O PROCEDIMENTO PEDE. Cada número de GRD pode ter R00, R01… e o que
  // vale é a maior. As anteriores ficam como histórico, que é o outro lado do mesmo pedido.
  const porNumero = new Map();
  for (const g of grds) {
    const atual = porNumero.get(g.numero);
    if (!atual || g.revisao > atual.revisao) porNumero.set(g.numero, g);
  }

  // ⚠ SEM OP NÃO ENTRA NA LISTA. Vitor (31/08/2026): "as que estão sem OP nem precisa listar".
  // São 27 GRDs de cabeçalho fora do padrão — sem obra, elas não respondem à pergunta que esta tela
  // existe para responder ("o que foi liberado para esta obra") e só empurrariam as demais para
  // baixo. Continuam gravadas: se um dia o cabeçalho for corrigido, a próxima leitura as encaixa.
  const ops = new Map();
  for (const g of grds) {
    if (!g.opNumero) continue;
    const k = g.opNumero;
    if (!ops.has(k)) ops.set(k, { opNumero: g.opNumero, opCodigo: g.opCodigo, referencia: g.referencia, grds: [], docs: 0, pesoKg: 0, ultima: null });
    const o = ops.get(k);
    o.grds.push({ ...g, vigente: porNumero.get(g.numero)?.id === g.id });
    if (porNumero.get(g.numero)?.id === g.id) { o.docs += g.qtdDocs; o.pesoKg += g.pesoKg || 0; }
    if (!o.ultima || (g.data && g.data > o.ultima)) o.ultima = g.data;
    if (!o.referencia && g.referencia) o.referencia = g.referencia;
  }

  const lista = [...ops.values()].sort((a, b) => Number(b.opNumero) - Number(a.opNumero));
  const semOp = grds.filter((g) => !g.opNumero).length;

  return NextResponse.json({
    ops: lista,
    total: grds.length - semOp,
    semOp, // fora da lista, mas contado: é o que diz que há cabeçalho a corrigir na pasta
    comRevisao: [...porNumero.values()].filter((g) => g.opNumero && g.revisao > 0).length,
  });
}
