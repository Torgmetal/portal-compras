// GET — busca de produtos do Omie (tabela local EstoqueItem) para o Fiscal escolher
// manualmente o produto de um material sem código. Retorna código, descrição, unidade
// e o custo resolvido (preço de compra → estoque) pra já sugerir o valor.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { resolverCustoPorCodigo } from "@/lib/custo-material";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "FISCAL", "FINANCEIRO"];

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ success: true, produtos: [] });

  const items = await prisma.estoqueItem.findMany({
    where: {
      ativo: true,
      OR: [
        { descricao: { contains: q, mode: "insensitive" } },
        { codigoOmie: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { descricao: "asc" },
    take: 30,
    select: { codigoOmie: true, descricao: true, unidade: true, cmc: true },
  });

  const custos = await resolverCustoPorCodigo(items.map((i) => i.codigoOmie));
  const produtos = items.map((i) => {
    const c = custos[String(i.codigoOmie)];
    return {
      codigoOmie: i.codigoOmie,
      descricao: i.descricao,
      unidade: i.unidade,
      valorUnit: c ? c.valorUnit : (i.cmc > 0 ? i.cmc : null),
      fonte: c ? c.fonte : (i.cmc > 0 ? "estoque" : null),
    };
  });
  return NextResponse.json({ success: true, produtos });
}
