// POST /api/cotacao/:id/solicitar-desconto — pede ao fornecedor uma condição melhor
// SEM contar a ele que venceu alguma coisa.
//
// Vitor (30/08/2026): "além do botão para enviar a cada fornecedor para revisar com os itens que
// ele venceu, precisa ter uma para pedir um desconto, sem que ele saiba que ele venceu aqueles
// itens".
//
// ⚠⚠ A DIFERENÇA PARA A REVISÃO FINAL É O QUE O FORNECEDOR VÊ. Na revisão final o portal filtra
// `vencedor === true` — abrir o link já entrega o resultado da concorrência. Aqui NADA é filtrado:
// ele revê exatamente a mesma lista que cotou, com os mesmos preços que mandou. Como não há
// diferença entre o que ele viu antes e o que vê agora, o link não revela nada.
//
// ⚠ POR ISSO ESTA ROTA NÃO EXIGE VENCEDOR MARCADO — e nem olha para o campo. Exigir vencedores
// (como a revisão final faz, e com razão) amarraria o pedido de desconto ao resultado do mapa, que
// é justamente o que não pode transparecer. O sigilo real, porém, está em QUEM recebe: se só os
// vencedores receberem o e-mail, o fornecedor deduz. Quem escolhe isso é o comprador, e a tela
// avisa.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { log } from "@/lib/log";

const registro = log("api/cotacao/[id]/solicitar-desconto");

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
    select: {
      id: true, token: true, status: true, fornecedorNome: true,
      solicitadaRevisaoFinal: true, _count: { select: { itens: true } },
    },
  });
  if (!cot) return NextResponse.json({ error: "Cotação não encontrada." }, { status: 404 });
  if (cot.status === "CANCELADA") {
    return NextResponse.json({ error: "Cotação cancelada." }, { status: 409 });
  }
  if (cot.status === "DECLINADA") {
    return NextResponse.json({ error: "Esse fornecedor declinou a cotação — não há proposta para renegociar." }, { status: 409 });
  }
  if (cot.status !== "RECEBIDA") {
    return NextResponse.json(
      { error: "Esse fornecedor ainda não respondeu a cotação. Só dá para pedir desconto sobre uma proposta já enviada." },
      { status: 409 }
    );
  }
  // ⚠ A revisão final já contou ao fornecedor que ele venceu. Pedir desconto depois dela não
  // esconde mais nada, e ainda reabriria a lista filtrada — que é o modo errado para negociar.
  if (cot.solicitadaRevisaoFinal) {
    return NextResponse.json(
      { error: "Esse fornecedor já recebeu a revisão final (já sabe que venceu). Negocie o desconto direto com ele." },
      { status: 409 }
    );
  }

  await prisma.cotacao.update({
    where: { id: cot.id },
    data: { solicitadoDesconto: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "solicitar_desconto",
      entity: "Cotacao",
      entityId: cot.id,
      diff: { fornecedor: cot.fornecedorNome, itens: cot._count.itens },
    },
  }).catch(() => {});

  try {
    revalidatePath(`/fornecedores/c/${cot.token}`);
  } catch (e) {
    registro.erro("solicitar-desconto: falha ao revalidar path do fornecedor:", e);
  }

  return NextResponse.json({ ok: true, itens: cot._count.itens, token: cot.token });
}
