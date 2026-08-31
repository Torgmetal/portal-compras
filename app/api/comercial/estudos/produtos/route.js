// GET /api/comercial/estudos/produtos?item=TELHA_TERMO[&q=texto]
// Devolve os produtos do catálogo do Omie que servem para um item comercial do estudo.
//
// Vitor (31/08/2026): "puxe as telhas que já compramos e já traga os códigos do Omie; caso não
// tenha o item com a especificação, informe a necessidade de cadastro no OMIE".
//
// ⚠ A ESPECIFICAÇÃO SAI DO CATÁLOGO, não de uma lista escrita à mão. Uma lista congelada de
// "variações de mercado" nasce desatualizada e, pior, oferece na proposta item que o Compras não
// tem como comprar. Aqui o que aparece é o que existe no Omie — e o que não existe aparece como
// falta de cadastro, que é uma pendência acionável em vez de um silêncio.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { TERMOS_OMIE } from "@/lib/lqc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const item = String(u.searchParams.get("item") || "").trim();
  const q = String(u.searchParams.get("q") || "").trim();
  const termos = TERMOS_OMIE[item];
  if (!termos) return NextResponse.json({ error: "Item comercial desconhecido." }, { status: 400 });

  const where = {
    inativo: false,
    OR: termos.map((t) => ({ descricao: { contains: t, mode: "insensitive" } })),
    ...(q ? { descricao: { contains: q, mode: "insensitive" } } : {}),
  };

  const produtos = await prisma.produtoOmie.findMany({
    where,
    select: { codigo: true, codigoOmie: true, descricao: true, unidade: true, familia: true },
    orderBy: { descricao: "asc" },
    take: 200,
  });

  // ⚠ "Sem cadastro" é RESPOSTA, não erro. A tela precisa dizer ao comercial que aquele item da
  // proposta não tem produto no Omie — é o que transforma um preço chutado numa tarefa para alguém.
  return NextResponse.json({
    produtos,
    total: produtos.length,
    precisaCadastro: produtos.length === 0,
    familias: [...new Set(produtos.map((p) => p.familia).filter(Boolean))],
  });
}
