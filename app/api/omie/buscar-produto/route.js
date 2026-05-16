// GET /api/omie/buscar-produto?q=texto&limit=20
// Busca produtos no Omie via ListarProdutosResumido. Retorna array de
// { codigo, descricao, unidade } pra autocomplete em formularios.
//
// Estrategia em 2 niveis:
// 1) Tenta EstoqueItem local primeiro (rapido, dados ja sincronizados)
// 2) Fallback: chama Omie diretamente (quando produto nao esta sincronizado
//    com o estoque local)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OMIE_PROD_URL = "https://app.omie.com.br/api/v1/geral/produtos/";

async function callOmie(payload) {
  const resp = await fetch(OMIE_PROD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (data.faultstring) throw new Error(data.faultstring);
  return data;
}

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);
  if (q.length < 2) {
    return NextResponse.json({ itens: [], origem: "vazio" });
  }

  // 1) Tenta no EstoqueItem local primeiro
  try {
    const local = await prisma.estoqueItem.findMany({
      where: {
        ativo: true,
        OR: [
          { descricao: { contains: q, mode: "insensitive" } },
          { codigoOmie: { contains: q } },
        ],
      },
      take: limit,
      select: { codigoOmie: true, descricao: true, unidade: true },
      orderBy: { descricao: "asc" },
    });
    if (local.length > 0) {
      return NextResponse.json({
        itens: local.map((p) => ({
          codigo: p.codigoOmie,
          descricao: p.descricao,
          unidade: p.unidade,
        })),
        origem: "estoque-local",
      });
    }
  } catch (e) {
    console.warn("[buscar-produto] estoque local falhou:", e?.message);
  }

  // 2) Fallback: busca direto no Omie via ListarProdutosResumido
  const APP_KEY = process.env.OMIE_APP_KEY;
  const APP_SECRET = process.env.OMIE_APP_SECRET;
  if (!APP_KEY || !APP_SECRET) {
    return NextResponse.json({ itens: [], origem: "omie-sem-credenciais" });
  }

  try {
    const data = await callOmie({
      call: "ListarProdutosResumido",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{
        pagina: 1,
        registros_por_pagina: limit,
        apenas_importado_api: "N",
        // O Omie tem filtro por descricao parcial em alguns endpoints
        filtrar_apenas_descricao: q,
      }],
    });
    const lista = data.produto_servico_resumido || data.produto_resumido || [];
    return NextResponse.json({
      itens: lista.map((p) => ({
        codigo: String(p.codigo || p.codigo_produto || ""),
        descricao: String(p.descricao || "").trim(),
        unidade: String(p.unidade || "UN").trim().toUpperCase(),
      })).filter((i) => i.codigo && i.descricao),
      origem: "omie",
    });
  } catch (e) {
    return NextResponse.json({
      itens: [],
      origem: "omie-erro",
      erro: e?.message,
    });
  }
}
