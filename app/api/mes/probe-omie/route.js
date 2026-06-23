import { NextResponse } from "next/server";

// SONDA TEMPORARIA — isola qual chamada do Omie traz produtos/estoque, p/ corrigir
// o /api/omie/buscar-produto da RM Interna. Bearer MES_SYNC_API_KEY. Remover depois.

export const maxDuration = 60;

async function omie(url, call, param) {
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie nao configuradas");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
    signal: AbortSignal.timeout(20000),
  });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { _raw: txt.slice(0, 300) }; }
}

const URL_PROD = "https://app.omie.com.br/api/v1/geral/produtos/";
const URL_EST  = "https://app.omie.com.br/api/v1/estoque/consulta/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeBR = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };

export async function GET(req) {
  if ((req.headers.get("authorization") || "").slice(7) !== process.env.MES_SYNC_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // q da query varia os params -> evita "consumo redundante" do Omie entre chamadas minhas
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  const out = {};
  const testes = [
    { nome: "ProdResumido", url: URL_PROD, call: "ListarProdutosResumido", param: q ? { pagina: 1, registros_por_pagina: 5, filtrar_apenas_descricao: q } : { pagina: 1, registros_por_pagina: 5 } },
    { nome: "ListarProdutos", url: URL_PROD, call: "ListarProdutos", param: { pagina: 1, registros_por_pagina: 3 } },
    { nome: "PosEstoque", url: URL_EST, call: "ListarPosEstoque", param: { nPagina: 1, nRegPorPagina: 3, dDataPosicao: hojeBR() } },
  ];
  for (const t of testes) {
    try {
      const r = await omie(t.url, t.call, t.param);
      const lista = r.produto_servico_resumido || r.produto_servico_cadastro || r.produtos || [];
      out[t.nome] = {
        faultstring: r.faultstring || null,
        total: r.total_de_registros ?? r.nTotRegistros ?? null,
        chaves: Object.keys(r || {}),
        amostra: Array.isArray(lista) ? lista.slice(0, 2) : null,
      };
    } catch (e) { out[t.nome] = { erro: e.message }; }
    await sleep(800);
  }
  return NextResponse.json(out);
}
