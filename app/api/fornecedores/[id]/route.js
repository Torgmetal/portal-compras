// PATCH: edita fornecedor. DELETE: remove (hard delete por enquanto;
// se preferir soft delete, usar PATCH com ativo=false).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const CATEGORIAS_VALIDAS = ["MATERIA_PRIMA", "TINTA", "PARAFUSOS", "MATERIAL_AUXILIAR", "EPI", "FERRAMENTAS", "SERVICOS"];

const patchSchema = z.object({
  razaoSocial: z.string().min(1).optional(),
  nomeFantasia: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  email: z.string().email().optional(),
  emailsAdicionais: z.array(z.string().email()).optional(),
  telefone: z.string().optional().nullable(),
  contato: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
  categorias: z.array(z.enum(CATEGORIAS_VALIDAS)).optional(),
  observacao: z.string().optional().nullable(),
  nCodOmie: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
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

  const existe = await prisma.fornecedor.findUnique({ where: { id: params.id } });
  if (!existe) return NextResponse.json({ error: "Nao encontrado." }, { status: 404 });

  // Sanitiza campos com transformacao
  const dataUpdate = { ...body };
  if (body.razaoSocial !== undefined) dataUpdate.razaoSocial = body.razaoSocial.trim();
  if (body.nomeFantasia !== undefined) dataUpdate.nomeFantasia = body.nomeFantasia?.trim() || null;
  if (body.cnpj !== undefined) dataUpdate.cnpj = body.cnpj?.replace(/\D/g, "") || null;
  if (body.email !== undefined) dataUpdate.email = body.email.trim().toLowerCase();
  if (body.emailsAdicionais !== undefined) dataUpdate.emailsAdicionais = body.emailsAdicionais.map((e) => e.trim().toLowerCase());
  if (body.telefone !== undefined) dataUpdate.telefone = body.telefone?.trim() || null;
  if (body.contato !== undefined) dataUpdate.contato = body.contato?.trim() || null;
  if (body.cidade !== undefined) dataUpdate.cidade = body.cidade?.trim() || null;
  if (body.uf !== undefined) dataUpdate.uf = body.uf?.trim().toUpperCase() || null;
  if (body.observacao !== undefined) dataUpdate.observacao = body.observacao?.trim() || null;
  if (body.nCodOmie !== undefined) dataUpdate.nCodOmie = body.nCodOmie?.trim() || null;

  const updated = await prisma.fornecedor.update({
    where: { id: params.id },
    data: dataUpdate,
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "edit_fornecedor",
      entity: "Fornecedor",
      entityId: existe.id,
      diff: { razaoSocial: existe.razaoSocial, mudancas: Object.keys(body) },
    },
  });

  return NextResponse.json({ fornecedor: updated });
}

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }
  const existe = await prisma.fornecedor.findUnique({ where: { id: params.id } });
  if (!existe) return NextResponse.json({ error: "Nao encontrado." }, { status: 404 });

  await prisma.fornecedor.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_fornecedor",
      entity: "Fornecedor",
      entityId: existe.id,
      diff: { razaoSocial: existe.razaoSocial, email: existe.email },
    },
  });
  return NextResponse.json({ ok: true });
}
