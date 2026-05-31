// POST /api/cotacao/:id/solicitar-revisao-final — marca a cotacao como "modo
// revisao final" pra que o portal do fornecedor mostre APENAS os itens em
// que ele venceu, pra confirmar os valores finais antes do pedido.
//
// Pre-requisito: ao menos um CotacaoItem dessa cotacao deve ter vencedor=true.
// O frontend ja deve ter marcado os vencedores via /api/cotacao/[id]/vencedores
// (ou similar) antes de chamar este endpoint.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const cot = await prisma.cotacao.findUnique({
    where: { id: params.id },
    include: {
      itens: { select: { id: true, vencedor: true } },
    },
  });
  if (!cot) return NextResponse.json({ error: "Cotacao nao encontrada." }, { status: 404 });
  if (cot.status === "CANCELADA") {
    return NextResponse.json({ error: "Cotacao cancelada." }, { status: 409 });
  }

  const vencedores = cot.itens.filter((i) => i.vencedor === true);
  if (vencedores.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nenhum item dessa cotacao foi marcado como vencedor. Volte ao mapa, marque os vencedores e tente novamente.",
      },
      { status: 400 }
    );
  }

  await prisma.cotacao.update({
    where: { id: cot.id },
    data: { solicitadaRevisaoFinal: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "solicitar_revisao_final",
      entity: "Cotacao",
      entityId: cot.id,
      diff: {
        fornecedor: cot.fornecedorNome,
        itensVencedores: vencedores.length,
      },
    },
  });

  // Invalida cache da pagina do fornecedor (so por garantia — o portal usa
  // dynamic = "force-dynamic", mas algumas vezes o Router Cache do Next.js
  // mantem versao antiga)
  try {
    revalidatePath(`/fornecedores/c/${cot.token}`);
  } catch (e) {
    console.error("solicitar-revisao-final: falha ao revalidar path do fornecedor:", e);
  }

  return NextResponse.json({
    ok: true,
    itensVencedores: vencedores.length,
    token: cot.token,
  });
}
