// GET ?numero=1892 — itens de um pedido de compra (p/ o estoque selecionar o que chegou e
// lançar no CMR já com a descrição EXATA da RM — concilia sozinho).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const numero = (new URL(req.url).searchParams.get("numero") || "").trim();
  if (!numero) return NextResponse.json({ error: "Informe o número do pedido." }, { status: 400 });

  const ped = await prisma.pedidoOmie.findFirst({
    where: { numeroPedido: numero },
    orderBy: { createdAt: "desc" },
    select: { numeroPedido: true, fornecedorNome: true, opId: true, nfNumero: true, itensOmie: true },
  });
  if (!ped) return NextResponse.json({ error: `Pedido ${numero} não encontrado no portal.` }, { status: 404 });

  const op = ped.opId ? await prisma.oP.findUnique({ where: { id: ped.opId }, select: { numero: true } }).catch(() => null) : null;
  const itens = (Array.isArray(ped.itensOmie) ? ped.itensOmie : []).map((it, i) => ({
    idx: i,
    descricao: it.descricao || "",
    qtd: Number(it.qtd) || 0,
    unidade: it.unidade || null,
    valorUnit: Number(it.valorUnit) || 0,
    qtdRecebida: Number(it.qtdRecebida) || 0,
  })).filter((it) => it.descricao);

  return NextResponse.json({
    success: true,
    pedido: numero,
    fornecedor: ped.fornecedorNome || null,
    obra: op?.numero ? `OP ${op.numero}` : null,
    nf: ped.nfNumero || null,
    itens,
  });
}
