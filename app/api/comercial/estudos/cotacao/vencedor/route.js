// POST /api/comercial/estudos/cotacao/vencedor { fornecedorId }  — marca o vencedor do mapa.
//
// ⚠ UM VENCEDOR POR CONSULTA. Marcar o segundo desmarca o primeiro: duas propostas vencedoras na
// mesma consulta não querem dizer nada, e é o tipo de estado inconsistente que só aparece quando
// alguém for usar o número.
//
// ⚠⚠ O VENCEDOR NÃO É AVISADO DAQUI. Vitor já disse, no Compras, que o fornecedor não pode saber
// que venceu antes da hora — e aqui a obra nem foi vendida. Marcar é decisão interna do orçamento.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { fornecedorId } = await req.json().catch(() => ({}));
  if (!fornecedorId) return NextResponse.json({ error: "Sem fornecedor." }, { status: 400 });

  const alvo = await prisma.cotacaoEstudoFornecedor.findUnique({
    where: { id: fornecedorId },
    select: { id: true, cotacaoId: true, vencedor: true, nome: true, valorTotal: true },
  });
  if (!alvo) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });

  const virar = !alvo.vencedor;
  await prisma.$transaction([
    prisma.cotacaoEstudoFornecedor.updateMany({ where: { cotacaoId: alvo.cotacaoId }, data: { vencedor: false } }),
    ...(virar ? [prisma.cotacaoEstudoFornecedor.update({ where: { id: alvo.id }, data: { vencedor: true } })] : []),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: virar ? "COTACAO_ESTUDO_VENCEDOR" : "COTACAO_ESTUDO_VENCEDOR_DESMARCADO",
      entity: "CotacaoEstudoFornecedor", entityId: alvo.id,
      diff: { fornecedor: alvo.nome, valorTotal: alvo.valorTotal },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, vencedor: virar });
}
