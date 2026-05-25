import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// PATCH — ADMIN edita item de aditivo diretamente.
const schema = z.object({
  descricao: z.string().min(1).optional(),
  codigoOmie: z.string().nullable().optional(),
  localEstoque: z.string().nullable().optional(),
  unidade: z.string().nullable().optional(),
  qtdContratada: z.number().nullable().optional(),
  cmcMedio: z.number().nullable().optional(),
  meses: z.number().nullable().optional(),
  valorPorMes: z.number().nullable().optional(),
  capacidade: z.string().nullable().optional(),
  valorVerba: z.number().min(0).optional(),
  faturamentoDireto: z.boolean().optional(),
  observacao: z.string().nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }
  if (user.modulos?.includes("COMERCIAL") && !user.podeAlterarVerba) {
    return NextResponse.json(
      { error: "Voce nao tem permissao pra editar itens diretamente. Use 'Solicitar verba' pra propor alteracao." },
      { status: 403 }
    );
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + (e.message || "") }, { status: 400 });
  }

  const item = await prisma.aditivoItem.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "Item nao encontrado." }, { status: 404 });

  const updated = await prisma.aditivoItem.update({ where: { id: params.id }, data: body });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "edit_aditivo_item",
      entity: "AditivoItem",
      entityId: item.id,
      diff: {
        aditivoId: item.aditivoId,
        descricao: item.descricao,
        antes: {
          valorVerba: item.valorVerba,
          qtdContratada: item.qtdContratada,
          cmcMedio: item.cmcMedio,
          meses: item.meses,
          valorPorMes: item.valorPorMes,
        },
        depois: {
          valorVerba: updated.valorVerba,
          qtdContratada: updated.qtdContratada,
          cmcMedio: updated.cmcMedio,
          meses: updated.meses,
          valorPorMes: updated.valorPorMes,
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
