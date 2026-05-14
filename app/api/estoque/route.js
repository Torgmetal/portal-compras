// GET /api/estoque — lista items de estoque com filtros opcionais
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const busca = searchParams.get("busca")?.trim();
  const cat = searchParams.get("categoria");
  const ativosApenas = searchParams.get("ativos") !== "0";

  const where = {};
  if (ativosApenas) where.ativo = true;
  if (cat) where.categoriaOmie = cat;
  if (busca) {
    where.OR = [
      { descricao: { contains: busca, mode: "insensitive" } },
      { codigoOmie: { contains: busca, mode: "insensitive" } },
    ];
  }

  const items = await prisma.estoqueItem.findMany({
    where,
    orderBy: { descricao: "asc" },
  });
  return NextResponse.json({ items });
}
