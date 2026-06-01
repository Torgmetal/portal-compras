// GET: lista todos fornecedores (com filtro opcional por categoria e busca).
// POST: cria novo fornecedor.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CATEGORIAS_FORNECEDOR_BUILTIN } from "@/lib/fornecedor-categorias";
import { titleCaseNome, chaveNormalizacao } from "@/lib/normalizar-nome";

const CODIGOS_BUILTIN = new Set(CATEGORIAS_FORNECEDOR_BUILTIN.map((c) => c.codigo));

// Valida que cada codigo de categoria existe (built-in OU custom no banco).
// Retorna { ok: true } ou { ok: false, erro: "..." }
async function validarCategorias(codigos) {
  if (!Array.isArray(codigos) || codigos.length === 0) return { ok: true };
  const desconhecidas = codigos.filter((c) => !CODIGOS_BUILTIN.has(c));
  if (desconhecidas.length === 0) return { ok: true };
  // Procura no banco as customizadas
  const encontradas = await prisma.categoriaFornecedor.findMany({
    where: { codigo: { in: desconhecidas } },
    select: { codigo: true },
  });
  const codigosEncontrados = new Set(encontradas.map((c) => c.codigo));
  const naoExistem = desconhecidas.filter((c) => !codigosEncontrados.has(c));
  if (naoExistem.length > 0) {
    return { ok: false, erro: `Categorias desconhecidas: ${naoExistem.join(", ")}` };
  }
  return { ok: true };
}

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
  // Aceita qualquer string; validacao real consulta banco pra confirmar
  // se cada codigo existe (built-in ou custom)
  categorias: z.array(z.string().min(1)).default([]),
  observacao: z.string().optional().nullable(),
  nCodOmie: z.string().optional().nullable(),
  ativo: z.boolean().default(true),
});

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
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
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  // Valida que cada codigo de categoria existe (built-in ou custom)
  const validacao = await validarCategorias(body.categorias);
  if (!validacao.ok) {
    return NextResponse.json({ error: validacao.erro }, { status: 400 });
  }

  // Normaliza nomes pra MAIÚSCULO
  const razaoNormalizada = body.razaoSocial.trim().toUpperCase();
  const fantasiaNormalizada = body.nomeFantasia ? body.nomeFantasia.trim().toUpperCase() : null;

  // Verifica duplicata (nome similar já existente)
  const chave = chaveNormalizacao(razaoNormalizada);
  if (chave) {
    const existentes = await prisma.fornecedor.findMany({
      where: { ativo: true },
      select: { id: true, razaoSocial: true },
    });
    const duplicata = existentes.find(
      (f) => chaveNormalizacao(f.razaoSocial) === chave
    );
    if (duplicata) {
      return NextResponse.json(
        { error: `Já existe um fornecedor com nome similar: "${duplicata.razaoSocial}". Se quiser cadastrar mesmo assim, edite o nome para diferenciá-lo.` },
        { status: 409 }
      );
    }
  }

  const fornecedor = await prisma.fornecedor.create({
    data: {
      razaoSocial: razaoNormalizada,
      nomeFantasia: fantasiaNormalizada,
      cnpj: body.cnpj?.replace(/\D/g, "") || null,
      email: body.email.trim().toLowerCase(),
      emailsAdicionais: body.emailsAdicionais.map((e) => e.trim().toLowerCase()),
      telefone: body.telefone?.trim() || null,
      contato: body.contato ? titleCaseNome(body.contato) : null,
      cidade: body.cidade ? titleCaseNome(body.cidade) : null,
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
