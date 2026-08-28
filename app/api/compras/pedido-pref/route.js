// GET ?cnpjs=00000000000191,11222333000181 — histórico de categoria de compra + local
// de estoque por fornecedor (do último pedido gerado no Omie pra aquele CNPJ). Serve pra
// pré-preencher o modal "Gerar Pedidos Omie". Só ADMIN/COMPRAS.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dig = (v) => String(v || "").replace(/\D/g, "");

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMPRAS"]); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const pedidos = (new URL(req.url).searchParams.get("cnpjs") || "").split(",").map(dig).filter((x) => x.length >= 11);
  const querSet = new Set(pedidos);

  // Pega os pedidos recentes que têm categoria/local salvos e casa por CNPJ normalizado.
  const recentes = await prisma.pedidoOmie.findMany({
    where: { categoriaCompra: { not: null } },
    select: { cnpj: true, categoriaCompra: true, localEstoque: true, fornecedorNome: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 3000,
  });

  const prefs = {};
  let sugestao = null;
  for (const p of recentes) {
    const c = dig(p.cnpj);
    if (!c || prefs[c]) continue; // 1º = mais recente
    if (querSet.size && !querSet.has(c)) continue;
    prefs[c] = { categoria: p.categoriaCompra, localEstoque: p.localEstoque || "", fornecedorNome: p.fornecedorNome, quando: p.createdAt };
    if (!sugestao) sugestao = prefs[c]; // o mais recente entre os pedidos pedidos
  }
  return NextResponse.json({ prefs, sugestao });
}
