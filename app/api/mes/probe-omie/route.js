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

  // Contas correntes do tipo CC/CA/CX (bancos/caixa) com nCodCC
  const lista = out.contasCorrentes?.amostra?.conta_corrente_lista || [];
  const contas = lista.map((c) => ({ nCodCC: c.nCodCC, descricao: c.descricao, banco: c.codigo_banco, tipo: c.tipo }));
  out.notas.push(`contas: ${contas.length}`);

  // 2) Extrato: ListarExtrato com params validos (dPeriodoInicial/dPeriodoFinal; SEM nPagina).
  //    Testa nas 3 primeiras contas com saldo/banco real, ultimos ~30 dias.
  const periodoIni = brHoje(-30), periodoFim = brHoje(0);
  const alvos = contas.filter((c) => c.nCodCC).slice(0, 3);
  for (const c of alvos) {
    try {
      const r = await omie(URL_EXTRATO, "ListarExtrato", {
        nCodCC: c.nCodCC, dPeriodoInicial: periodoIni, dPeriodoFinal: periodoFim, cExibirApenasSaldo: "N",
      });
      out.extrato[`${c.descricao} (${c.nCodCC})`] = {
        faultstring: r.faultstring || null,
        chaves: r.faultstring ? null : Object.keys(r),
        amostra: r.faultstring ? null : r,
      };
    } catch (e) { out.extrato[`${c.descricao} (${c.nCodCC})`] = { erro: e.message }; }
  }

  return NextResponse.json(out);
}
