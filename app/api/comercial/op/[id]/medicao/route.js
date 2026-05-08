import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { consultarPedidoVenda } from "@/lib/omie-pedido-venda";

// POST — vincula um Pedido de Venda do Omie como medicao da OP.
// Busca os dados via API do Omie e salva como snapshot.

const schema = z.object({
  numeroPedido: z.string().min(1),
  descricao: z.string().optional().nullable(),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const op = await prisma.oP.findUnique({ where: { id: params.id } });
  if (!op) return NextResponse.json({ error: "OP nao encontrada" }, { status: 404 });

  // Consulta no Omie
  const resultado = await consultarPedidoVenda({ numeroPedido: body.numeroPedido.trim() });
  if (resultado.error) {
    return NextResponse.json(
      { error: `Omie nao retornou o pedido: ${resultado.error}` },
      { status: 502 }
    );
  }

  // Verifica se ja foi vinculado a essa OP
  const ja = await prisma.oPMedicao.findUnique({
    where: { opId_numeroPedidoOmie: { opId: op.id, numeroPedidoOmie: resultado.numeroPedido } },
  });
  if (ja) {
    return NextResponse.json(
      { error: `Pedido ${resultado.numeroPedido} ja esta vinculado a essa OP.` },
      { status: 409 }
    );
  }

  const created = await prisma.oPMedicao.create({
    data: {
      opId: op.id,
      numeroPedidoOmie: resultado.numeroPedido,
      codigoPedidoOmie: resultado.codigoPedido,
      descricao: body.descricao || resultado.observacao || null,
      data: resultado.data,
      valorBruto: resultado.valorBruto || 0,
      valorLiquido: resultado.valorLiquido || null,
      status: resultado.status,
      etapa: resultado.etapa,
      qtdItens: resultado.qtdItens || 0,
      ultimoSync: new Date(),
      payload: resultado.raw,
      createdById: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "vincular_medicao",
      entity: "OPMedicao",
      entityId: created.id,
      diff: {
        opNumero: op.numero,
        numeroPedidoOmie: resultado.numeroPedido,
        valorBruto: resultado.valorBruto,
      },
    },
  });

  return NextResponse.json({ id: created.id });
}
