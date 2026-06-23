// GET /api/omie/buscar-produto?q=texto&limit=20
// Autocomplete de produtos pra RM Interna.
//
// Fonte AO VIVO: estoque/consulta ListarPosEstoque — traz TODOS os produtos com
// saldo atual (nSaldo), descrição e código. O endpoint geral/produtos
// (ListarProdutos/Resumido) retorna 0 com a API key atual (sem permissão do
// módulo Produtos), por isso usamos a posição de estoque, que funciona e já dá
// o saldo correto pós-consumo + itens recém-cadastrados.
//
// Cache de 60s da lista completa (poucos produtos) — evita o "consumo redundante"
// do Omie ao digitar e mantém a resposta rápida. Fallback: EstoqueItem local.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL_ESTOQUE = "https://app.omie.com.br/api/v1/estoque/consulta/";

function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

function hojeBR() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

async function omieEstoque(call, param) {
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie não configuradas");
  const res = await fetch(URL_ESTOQUE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  if (data.faultstring) throw new Error(data.faultstring);
  return data;
}

// Cache da posição de estoque completa (TTL 60s) — evita consumo redundante.
let _cache = { ts: 0, lista: [] };
async function getPosicaoEstoque() {
  if (Date.now() - _cache.ts < 60_000 && _cache.lista.length) return _cache.lista;
  const data = hojeBR();
  const lista = [];
  for (let pg = 1; pg <= 30; pg++) {
    const r = await omieEstoque("ListarPosEstoque", { nPagina: pg, nRegPorPagina: 200, dDataPosicao: data });
    for (const p of (r.produtos || [])) {
      const cod = String(p.cCodigo || "").trim();
      if (!cod) continue;
      lista.push({
        codigo: cod,
        descricao: String(p.cDescricao || "").trim(),
        unidade: String(p.cUnidade || "").trim().toUpperCase(),
        saldo: Number(p.nSaldo ?? p.fisico ?? 0),
      });
    }
    const tot = Number(r.nTotPaginas || 1);
    if (pg >= tot || (r.produtos || []).length === 0) break;
  }
  if (lista.length) _cache = { ts: Date.now(), lista };
  return lista;
}

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "REQUISICOES", "ENGENHARIA", "ALMOXARIFADO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);
  if (q.length < 2) return NextResponse.json({ itens: [], origem: "vazio" });

  const qn = q.toLowerCase();
  const qDigits = q.replace(/\D/g, "");

  // 1) AO VIVO via posição de estoque (saldo atual + itens novos)
  try {
    const lista = await getPosicaoEstoque();
    if (lista.length) {
      let itens = lista
        .filter((p) => p.descricao.toLowerCase().includes(qn) || (qDigits && p.codigo.includes(qDigits)) || p.codigo.includes(q))
        .sort((a, b) => a.descricao.localeCompare(b.descricao))
        .slice(0, limit);

      // Enriquece unidade pelo espelho local (ListarPosEstoque nem sempre traz cUnidade)
      if (itens.some((i) => !i.unidade)) {
        const locais = await prisma.estoqueItem.findMany({
          where: { codigoOmie: { in: itens.map((i) => i.codigo) } },
          select: { codigoOmie: true, unidade: true },
        });
        const um = new Map(locais.map((l) => [l.codigoOmie, l.unidade]));
        itens = itens.map((i) => ({ ...i, unidade: i.unidade || um.get(i.codigo) || "UN" }));
      }

      return NextResponse.json({
        itens: itens.map((i) => ({
          codigo: i.codigo,
          descricao: decodeEntities(i.descricao),
          unidade: i.unidade || "UN",
          saldo: i.saldo,
        })),
        origem: "omie-posestoque",
      });
    }
  } catch (e) {
    console.warn("[buscar-produto] ListarPosEstoque falhou, usando local:", e?.message);
  }

  // 2) Fallback: EstoqueItem local (se o Omie estiver fora)
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
      select: { codigoOmie: true, descricao: true, unidade: true, qtdAtual: true },
      orderBy: { descricao: "asc" },
    });
    return NextResponse.json({
      itens: local.map((p) => ({
        codigo: p.codigoOmie,
        descricao: decodeEntities(p.descricao),
        unidade: p.unidade,
        saldo: p.qtdAtual ?? null,
      })),
      origem: "estoque-local-fallback",
    });
  } catch (e) {
    return NextResponse.json({ itens: [], origem: "erro", erro: e?.message });
  }
}
