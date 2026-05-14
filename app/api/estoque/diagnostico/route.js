// GET /api/estoque/diagnostico — retorna a primeira pagina do ListarProdutos
// do Omie SEM filtro, pra ver a estrutura dos produtos e descobrir como
// a categoria/familia esta nomeada/codificada.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const OMIE_PROD_URL = "https://app.omie.com.br/api/v1/geral/produtos/";

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const APP_KEY = process.env.OMIE_APP_KEY;
  const APP_SECRET = process.env.OMIE_APP_SECRET;
  if (!APP_KEY || !APP_SECRET) {
    return NextResponse.json({ error: "Omie nao configurado" }, { status: 500 });
  }

  let data = null;
  try {
    const resp = await fetch(OMIE_PROD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarProdutos",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [{ pagina: 1, registros_por_pagina: 20, apenas_importado_api: "N" }],
      }),
    });
    data = await resp.json();
  } catch (e) {
    return NextResponse.json({ error: "Falha rede: " + e.message }, { status: 500 });
  }

  if (data.faultstring) {
    return NextResponse.json({ error: data.faultstring, raw: data }, { status: 500 });
  }

  const lista = data.produto_servico_cadastro || data.produto_cadastro || [];

  // Agrega categorias/familias unicas pra usuario ver
  const familiasMap = new Map();
  for (const p of lista) {
    const codigo = String(p.codigo_familia || p.cCodFamilia || "").trim();
    const desc = (p.descricao_familia || p.cDescFamilia || "").trim();
    if (codigo || desc) {
      const k = `${codigo}|${desc}`;
      familiasMap.set(k, { codigo, descricao: desc, contagem: (familiasMap.get(k)?.contagem || 0) + 1 });
    }
  }
  const familiasUnicas = Array.from(familiasMap.values()).sort((a, b) => b.contagem - a.contagem);

  return NextResponse.json({
    totalNaPagina: lista.length,
    totalPaginas: data.total_de_paginas || null,
    totalRegistros: data.total_de_registros || null,
    familiasEncontradas: familiasUnicas,
    // Mostra estrutura completa do primeiro produto pra inspecao
    exemploProduto: lista[0] || null,
  });
}
