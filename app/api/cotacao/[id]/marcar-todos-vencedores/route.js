import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({ vencedor: z.boolean() });

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode marcar vencedores." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 });
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { id: params.id },
    include: { itens: { select: { id: true, rmItemId: true, precoUnit: true } } },
  });
  if (!cotacao) return NextResponse.json({ error: "Cotação não encontrada." }, { status: 404 });

  const itensComPreco = cotacao.itens.filter((it) => it.precoUnit > 0);

  await prisma.$transaction(async (tx) => {
    if (body.vencedor) {
      // Pra cada rmItem, desmarca vencedores em outras cotacoes
      const rmItemIds = itensComPreco.map((it) => it.rmItemId);
      await tx.cotacaoItem.updateMany({
        where: {
          rmItemId: { in: rmItemIds },
          vencedor: true,
          NOT: { id: { in: itensComPreco.map((it) => it.id) } },
        },
        data: { vencedor: false },
      });
      // Marca todos os itens dessa cotacao com preco > 0 como vencedor
      await tx.cotacaoItem.updateMany({
        where: { id: { in: itensComPreco.map((it) => it.id) } },
        data: { vencedor: true },
      });
    } else {
      // Desmarca todos os itens dessa cotacao
      await tx.cotacaoItem.updateMany({
        where: { id: { in: itensComPreco.map((it) => it.id) } },
        data: { vencedor: false },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: body.vencedor ? "marcar_todos_vencedores" : "desmarcar_todos_vencedores",
        entity: "Cotacao",
        entityId: cotacao.id,
        diff: { fornecedor: cotacao.fornecedorNome, itens: itensComPreco.length },
      },
    });
  });

  return NextResponse.json({ ok: true, count: itensComPreco.length });
}
