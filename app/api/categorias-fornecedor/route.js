// GET /api/categorias-fornecedor — lista categorias custom (do banco).
// POST /api/categorias-fornecedor — cria nova categoria custom.
//
// Built-in (MATERIA_PRIMA etc) ficam em lib/fornecedor-categorias.js,
// nao sao gerenciaveis via API. Aqui sao as ADICIONAIS.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  CATEGORIAS_FORNECEDOR_BUILTIN,
  CORES_DISPONIVEIS,
  slugifyCategoria,
} from "@/lib/fornecedor-categorias";

const schema = z.object({
  label: z.string().min(2).max(60),
  color: z.enum(CORES_DISPONIVEIS).optional().default("slate"),
});

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }
  const itens = await prisma.categoriaFornecedor.findMany({
    where: { ativa: true },
    orderBy: [{ ordem: "asc" }, { label: "asc" }],
  });
  return NextResponse.json({ itens });
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

  const codigo = slugifyCategoria(body.label);
  if (!codigo) return NextResponse.json({ error: "Label invalido." }, { status: 400 });

  // Bloqueia colisao com built-in
  const codigosBuiltin = new Set(CATEGORIAS_FORNECEDOR_BUILTIN.map((c) => c.codigo));
  if (codigosBuiltin.has(codigo)) {
    return NextResponse.json(
      { error: `Categoria "${body.label}" ja existe como built-in.` },
      { status: 409 }
    );
  }

  // Bloqueia duplicada
  const ja = await prisma.categoriaFornecedor.findUnique({ where: { codigo } });
  if (ja) {
    return NextResponse.json(
      { error: `Categoria "${body.label}" ja cadastrada.` },
      { status: 409 }
    );
  }

  const criada = await prisma.categoriaFornecedor.create({
    data: {
      codigo,
      label: body.label.trim(),
      color: body.color,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "criar_categoria_fornecedor",
      entity: "CategoriaFornecedor",
      entityId: criada.id,
      diff: { codigo: criada.codigo, label: criada.label },
    },
  });

  return NextResponse.json({ item: criada });
}
