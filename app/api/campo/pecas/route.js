// GET — busca a peça pela marca dentro de uma OP. É a saída para peça SEM QR.
//
// Vitor (21/08/2026): "pode ter peça com ou sem QR". Onde tem QR o desenho identifica; onde não
// tem, a pessoa procura aqui. Os dois são caminhos normais, não exceção.
//
// ⚠ CONJUNTO PRIMEIRO. Foto de inspeção quase sempre é do conjunto montado, não do croqui que foi
// cortado — e a OP-067 tem 1.330 conjuntos contra 3.841 croquis. Misturar os dois faz o inspetor
// rolar lista atrás do que ele quer.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const opId = url.searchParams.get("opId");
  const busca = (url.searchParams.get("q") || "").trim();
  const todas = url.searchParams.get("todas") === "1";
  if (!opId) return NextResponse.json({ error: "OP não informada" }, { status: 400 });

  const pecas = await prisma.pecaConjunto.findMany({
    where: {
      opId,
      ...(todas ? {} : { tipoPeca: "CONJUNTO" }),
      ...(busca ? { marca: { contains: busca, mode: "insensitive" } } : {}),
    },
    select: { marca: true, descricao: true, tipoPeca: true, perfil: true, qte: true },
    orderBy: { marca: "asc" },
  });

  // a mesma marca aparece em sub-obras diferentes (ver lib/rastreio-peca) — na busca isso vira
  // linha repetida sem serventia; o que interessa aqui é o nome que a pessoa vai reconhecer
  const porMarca = new Map();
  for (const p of pecas) {
    const marca = p.marca.trim().toUpperCase();
    const anterior = porMarca.get(marca);
    porMarca.set(marca, { ...p, marca, quantidade: (anterior?.quantidade || 0) + (p.qte || 0) });
  }
  const lista = [...porMarca.values()];
  return NextResponse.json({ pecas: lista.slice(0, 60), temMais: lista.length > 60 });
}
