// POST /api/diretoria/fluxo/pasta/baixa { opId, baixada, motivo? } — tira (ou devolve) uma obra
// antiga da lista de conferência de desenhos.
//
// Vitor (25/08/2026): "preciso de uma opção para dar baixa em algumas OPs que são antigas, poderia
// ver uma maneira para registrar isso e tirar elas da seleção".
//
// ⚠ NÃO ENCERRA A OP. A obra continua igual no resto do portal — isto some só com a linha DESTE
// painel. Encerrar de verdade mexe em cronograma, expedição e financeiro, e não é o que foi pedido.
//
// ⚠ REGISTRA QUEM E POR QUÊ, e é reversível. Baixa sem autor vira, meses depois, "sumiu do painel e
// ninguém sabe explicar" — e aí a conferência inteira perde a confiança.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let user;
  try { user = await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opId, baixada = true, motivo } = await req.json().catch(() => ({}));
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const dados = baixada
    ? { baixada: true, baixadaEm: new Date(), baixadaPorNome: user?.name || user?.email || null, baixaMotivo: (motivo || "").trim() || null }
    : { baixada: false, baixadaEm: null, baixadaPorNome: null, baixaMotivo: null };

  // ⚠ upsert: obra nunca conferida ainda não tem linha, e dar baixa nela é justamente o caso comum
  // (obra velha que ninguém quer que o cron fique varrendo).
  await prisma.pastaEngenharia.upsert({
    where: { opId: op.id },
    create: { opId: op.id, veredito: "NAO_CONFERIDA", ...dados },
    update: dados,
  });

  return NextResponse.json({ ok: true, opId: op.id, numero: op.numero, ...dados });
}
