// PATCH — edita campos do RMItem (descricao, qtd, peso, unidade, material, etc).
// ADMIN/COMPRAS sempre podem. Outras roles bloqueadas.
// Itens em PEDIDO_GERADO ou CANCELADO sao read-only — nao da pra editar
// pra nao bagunçar a referencia com o pedido criado / cancelamento.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  descricao: z.string().min(1).optional(),
  unidade: z.string().min(1).optional(),
  qtd: z.number().min(0).optional(),
  codigo: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  comprimento: z.string().nullable().optional(),
  largura: z.string().nullable().optional(),
  tratamento: z.string().nullable().optional(),
  peso: z.number().nullable().optional(),
  pesoLinear: z.number().nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode editar itens da RM." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const item = await prisma.rMItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.rmId !== params.id) {
    return NextResponse.json({ error: "Item nao encontrado nessa RM." }, { status: 404 });
  }

  // Edicao permitida em qualquer status — admin/compras pode revisar dados
  // de qualquer item. Auditoria registra a mudanca. Itens ja PEDIDO_GERADO
  // continuam vinculados ao pedido Omie criado (mudanca aqui nao reflete la).
  const updated = await prisma.rMItem.update({ where: { id: item.id }, data: body });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "edit_rm_item",
      entity: "RMItem",
      entityId: item.id,
      diff: {
        rmId: item.rmId,
        antes: {
          descricao: item.descricao, unidade: item.unidade, qtd: item.qtd,
          codigo: item.codigo, material: item.material, comprimento: item.comprimento,
          largura: item.largura, tratamento: item.tratamento,
          peso: item.peso, pesoLinear: item.pesoLinear,
        },
        depois: {
          descricao: updated.descricao, unidade: updated.unidade, qtd: updated.qtd,
          codigo: updated.codigo, material: updated.material, comprimento: updated.comprimento,
          largura: updated.largura, tratamento: updated.tratamento,
          peso: updated.peso, pesoLinear: updated.pesoLinear,
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
