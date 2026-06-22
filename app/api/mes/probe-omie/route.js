import { NextResponse } from "next/server";

// SONDA TEMPORARIA — descobre o formato do extrato de conta corrente do Omie.
// Sob /api/mes/ porque o middleware libera esse prefixo p/ Bearer (financeiro exige sessao).
// Roda em producao (Vercel tem OMIE_APP_KEY/SECRET). Auth: Bearer MES_SYNC_API_KEY.
// Remover apos mapear a API.

export const maxDuration = 60;

async function omie(url, call, param) {
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie nao configuradas");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
    signal: AbortSignal.timeout(45000),
  });
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = { _raw: txt.slice(0, 500) }; }
  return json;
}

const URL_CC      = "https://app.omie.com.br/api/v1/geral/contacorrente/";
const URL_EXTRATO = "https://app.omie.com.br/api/v1/financas/extrato/";

function brHoje(off = 0) {
  const d = new Date(Date.now() + off * 86400000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export async function GET(req) {
  if ((req.headers.get("authorization") || "").slice(7) !== process.env.MES_SYNC_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const out = { contasCorrentes: null, extrato: {}, contasTried: [], notas: [] };

  // 1) Lista contas correntes — tenta os calls conhecidos
  for (const call of ["ListarResumoContasCorrentes", "ListarContasCorrentes", "PesquisarContasCorrentes"]) {
    try {
      const r = await omie(URL_CC, call, { pagina: 1, registros_por_pagina: 50 });
      out.contasTried.push({ call, ok: !r.faultstring, faultstring: r.faultstring || null });
      if (!r.faultstring) { out.contasCorrentes = { call, amostra: r }; break; }
    } catch (e) { out.contasTried.push({ call, erro: e.message }); }
  }

  // descobre um nCodCC pra testar o extrato
  let nCodCC = null;
  const cc = out.contasCorrentes?.amostra;
  if (cc) {
    const lista = cc.ListarResumoContasCorrentes || cc.conta_corrente_resumido || cc.conta_corrente_cadastro || cc.contasCorrentes || [];
    const first = Array.isArray(lista) ? lista[0] : null;
    nCodCC = first?.nCodCC || first?.codigo_conta_corrente || null;
    out.notas.push("nCodCC usado no teste de extrato: " + nCodCC);
  }

  // 2) Tenta o extrato com calls/params candidatos (ultimos ~30 dias)
  const periodoIni = brHoje(-30), periodoFim = brHoje(0);
  const tentativas = [
    { call: "ListarExtrato", param: { nCodCC, dPeriodoInicial: periodoIni, dPeriodoFinal: periodoFim, nPagina: 1, nRegPorPagina: 20 } },
    { call: "ListarExtrato", param: { nCodCC, cExibirApenasSaldo: "N", dDtInicial: periodoIni, dDtFinal: periodoFim, nPagina: 1, nRegPorPagina: 20 } },
    { call: "ObterExtrato",  param: { nCodCC, dPeriodoInicial: periodoIni, dPeriodoFinal: periodoFim } },
  ];
  for (let i = 0; i < tentativas.length; i++) {
    const t = tentativas[i];
    try {
      const r = await omie(URL_EXTRATO, t.call, t.param);
      out.extrato[`tent${i}_${t.call}`] = { param: t.param, faultstring: r.faultstring || null, amostra: r.faultstring ? null : r };
      if (!r.faultstring) break;
    } catch (e) { out.extrato[`tent${i}_${t.call}`] = { erro: e.message }; }
  }

  return NextResponse.json(out);
}
