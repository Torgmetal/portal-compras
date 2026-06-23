// GET /api/omie/buscar-produto?q=texto&limit=20
// Autocomplete de produtos pra RM Interna.
//
// Arquitetura (rápida + fresca):
// 1) Lê do espelho LOCAL EstoqueItem (instantâneo) — sincronizado de hora em hora
//    pelo cron /api/cron/estoque-produtos (ListarPosEstoque: produtos novos + saldo).
// 2) Fallback AO VIVO (estoque/consulta ListarPosEstoque, cache 60s) só quando o
//    local não acha nada — cobre item recém-cadastrado entre as sincronizações.
//
// Matching por PALAVRAS (não substring exata): "lente proteção 25mm" casa com
// "LENTE DE PROTEÇÃO - 25.4MM X 4MM". Tokens de dimensão (25mm, 34x5) são
// ignorados no AND (variam). Busca por código só quando o texto é um código.
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

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// Texto parece um CÓDIGO (sem espaço, tem dígito) → busca por código.
const ehCodigo = (q) => { const t = q.trim(); return /^[a-z0-9.\-/]{3,}$/i.test(t) && /\d/.test(t) && !/\s/.test(t); };
// Tokens significativos: têm letra e não são dimensão pura (ex: 25mm, 25.4mm, 34x5).
function tokensSig(q) {
  const toks = norm(q).split(/[\s\-_,./]+/).filter((t) => t.length >= 2);
  const sig = toks.filter((t) => /[a-z]/.test(t) && !/^\d+(?:[.,]\d+)?(?:mm|cm|m|kg|g|l|ml|pol|")?$/.test(t));
  return sig.length ? sig : toks;
}
// Produto casa com a busca (por palavras na descrição).
function casaDesc(descricao, sig) {
  const d = norm(descricao);
  return sig.every((t) => d.includes(t));
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

// Cache da posição de estoque completa (TTL 60s) — fallback de itens novos.
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

  const porCodigo = ehCodigo(q);
  const sig = tokensSig(q);
  const maiorToken = [...sig].sort((a, b) => b.length - a.length)[0] || q;

  // 1) LOCAL (instantâneo)
  try {
    let candidatos;
    if (porCodigo) {
      candidatos = await prisma.estoqueItem.findMany({
        where: { ativo: true, codigoOmie: { contains: q } },
        take: limit, select: { codigoOmie: true, descricao: true, unidade: true, qtdAtual: true }, orderBy: { descricao: "asc" },
      });
    } else {
      // Busca ampla pela maior palavra, depois filtra por TODAS as palavras em JS
      const brutos = await prisma.estoqueItem.findMany({
        where: { ativo: true, descricao: { contains: maiorToken, mode: "insensitive" } },
        take: 300, select: { codigoOmie: true, descricao: true, unidade: true, qtdAtual: true }, orderBy: { descricao: "asc" },
      });
      candidatos = brutos.filter((p) => casaDesc(p.descricao, sig)).slice(0, limit);
    }
    if (candidatos.length > 0) {
      return NextResponse.json({
        itens: candidatos.map((p) => ({
          codigo: p.codigoOmie, descricao: decodeEntities(p.descricao), unidade: p.unidade, saldo: p.qtdAtual ?? null,
        })),
        origem: "estoque-local",
      });
    }
  } catch (e) {
    console.warn("[buscar-produto] local falhou:", e?.message);
  }

  // 2) Fallback AO VIVO — item recém-cadastrado ainda não sincronizado
  try {
    const lista = await getPosicaoEstoque();
    let itens = lista
      .filter((p) => (porCodigo ? p.codigo.includes(q) : casaDesc(p.descricao, sig)))
      .sort((a, b) => a.descricao.localeCompare(b.descricao))
      .slice(0, limit);

    if (itens.some((i) => !i.unidade)) {
      const locais = await prisma.estoqueItem.findMany({
        where: { codigoOmie: { in: itens.map((i) => i.codigo) } },
        select: { codigoOmie: true, unidade: true },
      });
      const um = new Map(locais.map((l) => [l.codigoOmie, l.unidade]));
      itens = itens.map((i) => ({ ...i, unidade: i.unidade || um.get(i.codigo) || "UN" }));
    }

    return NextResponse.json({
      itens: itens.map((i) => ({ codigo: i.codigo, descricao: decodeEntities(i.descricao), unidade: i.unidade || "UN", saldo: i.saldo })),
      origem: "omie-posestoque",
    });
  } catch (e) {
    return NextResponse.json({ itens: [], origem: "omie-erro", erro: e?.message });
  }
}
