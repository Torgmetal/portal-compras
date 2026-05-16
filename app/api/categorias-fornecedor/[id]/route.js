// PATCH /api/categorias-fornecedor/:id — atualiza label/color/ordem.
// DELETE /api/categorias-fornecedor/:id — remove. So funciona se nenhum
// Fornecedor tem essa categoria. Senao o usuario precisa migrar antes.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CORES_DISPONIVEIS } from "@/lib/fornecedor-categorias";

const patchSchema = z.object({
  label: z.string().min(2).max(60).optional(),
  color: z.enum(CORES_DISPONIVEIS).optional(),
  ordem: z.number().int().optional(),
  ativa: z.boolean().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const atual = await prisma.categoriaFornecedor.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ error: "Categoria nao encontrada." }, { status: 404 });

  const dataUpdate = {};
  if (body.label !== undefined) dataUpdate.label = body.label.trim();
  if (body.color !== undefined) dataUpdate.color = body.color;
  if (body.ordem !== undefined) dataUpdate.ordem = body.ordem;
  if (body.ativa !== undefined) dataUpdate.ativa = body.ativa;

  const atualizada = await prisma.categoriaFornecedor.update({
    where: { id: atual.id },
    data: dataUpdate,
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "editar_categoria_fornecedor",
      entity: "CategoriaFornecedor",
      entityId: atual.id,
      diff: { antes: atual, depois: atualizada },
    },
  });

  return NextResponse.json({ item: atualizada });
}

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas ADMIN pode remover." }, { status: 403 });
  }

  const atual = await prisma.categoriaFornecedor.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ error: "Categoria nao encontrada." }, { status: 404 });

  // Verifica se algum fornecedor usa essa categoria
  const fornecedoresComCategoria = await prisma.fornecedor.findMany({
    where: { categorias: { has: atual.codigo } },
    select: { id: true, razaoSocial: true },
    take: 5,
  });
  if (fornecedoresComCategoria.length > 0) {
    return NextResponse.json(
      {
        error: `Nao da pra remover — ${fornecedoresComCategoria.length}+ fornecedor(es) ainda usam essa categoria. Edite-os antes pra trocar a categoria.`,
        fornecedores: fornecedoresComCategoria.map((f) => f.razaoSocial),
      },
      { status: 409 }
    );
  }

  await prisma.categoriaFornecedor.delete({ where: { id: atual.id } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "remover_categoria_fornecedor",
      entity: "CategoriaFornecedor",
      entityId: atual.id,
      diff: { codigo: atual.codigo, label: atual.label },
    },
  });

  return NextResponse.json({ ok: true });
}
