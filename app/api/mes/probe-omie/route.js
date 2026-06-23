import { NextResponse } from "next/server";

// SONDA TEMPORARIA — confirma busca de produtos (itens novos) + saldo ao vivo por
// produto no Omie, pra corrigir o /api/omie/buscar-produto da RM Interna.
// Sob /api/mes/ (middleware libera Bearer). Auth: Bearer MES_SYNC_API_KEY. Remover depois.

export const maxDuration = 60;

async function omie(url, call, param) {
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie nao configuradas");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
    signal: AbortSignal.timeout(30000),
  });
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { j = { _raw: txt.slice(0, 400) }; }
  return j;
}

const URL_PROD    = "https://app.omie.com.br/api/v1/geral/produtos/";
const URL_ESTOQUE = "https://app.omie.com.br/api/v1/estoque/consulta/";
const hojeBR = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };

export async function GET(req) {
  if ((req.headers.get("authorization") || "").slice(7) !== process.env.MES_SYNC_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const out = { calls: {} };

  // Testa várias chamadas pra isolar qual traz dados
  const testes = [
    { nome: "ProdResumido_min",  url: URL_PROD, call: "ListarProdutosResumido", param: { pagina: 1, registros_por_pagina: 5 } },
    { nome: "ProdResumido_napi", url: URL_PROD, call: "ListarProdutosResumido", param: { pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N" } },
    { nome: "ListarProdutos",    url: URL_PROD, call: "ListarProdutos",          param: { pagina: 1, registros_por_pagina: 5 } },
    { nome: "PosEstoque",        url: URL_ESTOQUE, call: "ListarPosEstoque",      param: { nPagina: 1, nRegPorPagina: 5, dDataPosicao: hojeBR() } },
  ];
  let prod = null;
  for (const t of testes) {
    try {
      const r = await omie(t.url, t.call, t.param);
      const chaves = r && typeof r === "object" ? Object.keys(r) : [];
      const lista = r.produto_servico_resumido || r.produto_resumido || r.produto_servico_cadastro || r.produtos || [];
      out.calls[t.nome] = {
        faultstring: r.faultstring || null,
        total: r.total_de_registros ?? r.nTotRegistros ?? null,
        chaves,
        amostra: Array.isArray(lista) ? lista.slice(0, 2) : null,
      };
      if (!prod && Array.isArray(lista) && lista.length) prod = lista[0];
    } catch (e) { out.calls[t.nome] = { erro: e.message }; }
  }

  // 2) Saldo ao vivo por produto — testa calls/params candidatos
  if (prod) {
    const codigo = String(prod.codigo || "");
    const codigoProd = prod.codigo_produto || prod.id_produto || null;
    out.posicao.testando = { codigo, codigoProd };
    const tentativas = [
      { call: "PosicaoEstoque", param: { codigo_local_produto: codigoProd, dDia: hojeBR(), cExibeTodos: "N" } },
      { call: "PosicaoEstoque", param: { id_prod: codigoProd, dDia: hojeBR() } },
      { call: "PosicaoEstoque", param: { nIdProduto: codigoProd, cCodIntProduto: codigo, dDia: hojeBR() } },
      { call: "ObterEstoqueProduto", param: { codigo_produto: codigoProd, dia: hojeBR() } },
    ];
    for (let i = 0; i < tentativas.length; i++) {
      const t = tentativas[i];
      try {
        const r = await omie(URL_ESTOQUE, t.call, t.param);
        out.posicao[`t${i}_${t.call}`] = { param: t.param, faultstring: r.faultstring || null, amostra: r.faultstring ? null : r };
        if (!r.faultstring) break;
      } catch (e) { out.posicao[`t${i}_${t.call}`] = { erro: e.message }; }
    }
  }

  return NextResponse.json(out);
}
