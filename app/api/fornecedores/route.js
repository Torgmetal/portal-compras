// GET: lista todos fornecedores (com filtro opcional por categoria e busca).
// POST: cria novo fornecedor.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const CATEGORIAS_VALIDAS = ["MATERIA_PRIMA", "TINTA", "PARAFUSOS", "MATERIAL_AUXILIAR", "EPI", "FERRAMENTAS", "SERVICOS"];

const schema = z.object({
  razaoSocial: z.string().min(1),
  nomeFantasia: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  email: z.string().email(),
  emailsAdicionais: z.array(z.string().email()).default([]),
  telefone: z.string().optional().nullable(),
  contato: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
  categorias: z.array(z.enum(CATEGORIAS_VALIDAS)).default([]),
  observacao: z.string().optional().nullable(),
  nCodOmie: z.string().optional().nullable(),
  ativo: z.boolean().default(true),
});

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const categoria = searchParams.get("categoria");
  const busca = searchParams.get("busca")?.trim();
  const ativosApenas = searchParams.get("ativos") !== "0"; // default true

  const where = {};
  if (ativosApenas) where.ativo = true;
  if (categoria) where.categorias = { has: categoria };
  if (busca) {
    where.OR = [
      { razaoSocial: { contains: busca, mode: "insensitive" } },
      { nomeFantasia: { contains: busca, mode: "insensitive" } },
      { email: { contains: busca, mode: "insensitive" } },
      { cnpj: { contains: busca, mode: "insensitive" } },
      { contato: { contains: busca, mode: "insensitive" } },
    ];
  }

  const fornecedores = await prisma.fornecedor.findMany({
    where,
    orderBy: { razaoSocial: "asc" },
  });
  return NextResponse.json({ fornecedores });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const fornecedor = await prisma.fornecedor.create({
    data: {
      razaoSocial: body.razaoSocial.trim(),
      nomeFantasia: body.nomeFantasia?.trim() || null,
      cnpj: body.cnpj?.replace(/\D/g, "") || null,
      email: body.email.trim().toLowerCase(),
      emailsAdicionais: body.emailsAdicionais.map((e) => e.trim().toLowerCase()),
      telefone: body.telefone?.trim() || null,
      contato: body.contato?.trim() || null,
      cidade: body.cidade?.trim() || null,
      uf: body.uf?.trim().toUpperCase() || null,
      categorias: body.categorias,
      observacao: body.observacao?.trim() || null,
      nCodOmie: body.nCodOmie?.trim() || null,
      ativo: body.ativo,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_fornecedor",
      entity: "Fornecedor",
      entityId: fornecedor.id,
      diff: { razaoSocial: fornecedor.razaoSocial, email: fornecedor.email, categorias: fornecedor.categorias },
    },
  });

  return NextResponse.json({ fornecedor });
}
