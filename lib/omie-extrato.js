// Extrato de conta corrente do Omie (financas/extrato → ListarExtrato) para o
// Fluxo de Caixa. Traz REALIZADO (cSituacao Conciliado/Não conciliado) e
// PREVISTO (cSituacao Previsto) — inclusive transferências entre contas.
//
// Cada movimento: nValorDocumento COM SINAL (negativo=saída, positivo=entrada),
// cSituacao, cOrigem, cDesCategoria, cRazCliente, dDataLancamento, nCodLancamento.

const URL_CC      = "https://app.omie.com.br/api/v1/geral/contacorrente/";
const URL_EXTRATO = "https://app.omie.com.br/api/v1/financas/extrato/";

async function omie(url, call, param) {
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie não configuradas");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
    signal: AbortSignal.timeout(50000),
  });
  const data = await res.json();
  if (data.faultstring) throw new Error(data.faultstring);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "YYYY-MM-DD" → "DD/MM/YYYY"
const isoParaBR = (s) => {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};
// "DD/MM/YYYY" → Date (meia-noite BRT)
const brParaDate = (s) => {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000-03:00`) : null;
};
const num = (v) => { const n = parseFloat(String(v ?? "0").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// Lista as contas correntes (bancos/caixa) cadastradas no Omie.
export async function listarContasCorrentes() {
  const d = await omie(URL_CC, "ListarResumoContasCorrentes", { pagina: 1, registros_por_pagina: 100 });
  return (d.conta_corrente_lista || []).map((c) => ({
    nCodCC: c.nCodCC,
    descricao: c.descricao,
    banco: c.codigo_banco,
    tipo: c.tipo,                 // CC=conta corrente, CA=aplicação, CX=caixa, AD=adiantamento
    fluxoCaixa: c.cFluxoCaixa,    // "S" = entra no fluxo de caixa
  }));
}

// Linhas de "saldo" do extrato que não são movimento real.
const ehSaldo = (mv) => !mv.nCodLancamento || /^SALDO/i.test(mv.cDesCliente || "");

// Normaliza um movimento do extrato → linha pronta pro FluxoCaixa.
function normalizar(mv, conta) {
  const valorAssinado = num(mv.nValorDocumento);          // <0 saída, >0 entrada
  const realizado = String(mv.cSituacao || "").toLowerCase() !== "previsto";
  const data = brParaDate(mv.dDataLancamento);
  const cliente = (mv.cRazCliente || mv.cDesCliente || "").trim();
  const tipoDoc = (mv.cTipoDocumento || "").trim();
  const descPartes = [cliente, tipoDoc, mv.cNumero ? `nº ${mv.cNumero}` : null].filter(Boolean);
  return {
    origemOmieId: `EXT-${conta.nCodCC}-${mv.nCodLancamento}`,
    contaCorrente: conta.descricao,
    nCodCC: conta.nCodCC,
    data,
    tipo: valorAssinado < 0 ? "SAIDA" : "ENTRADA",
    valor: Math.abs(valorAssinado),
    realizado,
    dataRealizado: realizado ? data : null,
    situacao: mv.cSituacao || null,            // Conciliado / Não conciliado / Previsto
    origem: mv.cOrigem || null,                // Conta Paga / Débito de Transferência / Previsão de ...
    categoria: (mv.cDesCategoria || mv.cOrigem || "").trim() || null,
    descricao: descPartes.join(" — ") || (mv.cOrigem || "Movimento"),
    natureza: mv.cNatureza || null,            // P / R
    cliente: cliente || null,
    documento: mv.cDocCliente || null,
  };
}

/**
 * Puxa o extrato de TODAS as contas correntes (com fluxo de caixa) no período e
 * devolve as linhas normalizadas (realizadas + previstas).
 * @param {{ de: string, ate: string, incluirAplicacoes?: boolean }} opts — datas "YYYY-MM-DD"
 */
export async function listarFluxoExtrato({ de, ate, incluirAplicacoes = false }) {
  const dPeriodoInicial = isoParaBR(de), dPeriodoFinal = isoParaBR(ate);
  if (!dPeriodoInicial || !dPeriodoFinal) throw new Error("Período inválido");

  const contas = await listarContasCorrentes();
  // Por padrão: contas que entram no fluxo de caixa. Aplicações (CA) opcionais.
  const alvo = contas.filter((c) =>
    c.nCodCC && (c.fluxoCaixa === "S" || (incluirAplicacoes && c.tipo === "CA"))
  );

  const movimentos = [];
  const porConta = [];
  for (const conta of alvo) {
    try {
      const d = await omie(URL_EXTRATO, "ListarExtrato", {
        nCodCC: conta.nCodCC, dPeriodoInicial, dPeriodoFinal, cExibirApenasSaldo: "N",
      });
      const linhas = (d.listaMovimentos || []).filter((mv) => !ehSaldo(mv)).map((mv) => normalizar(mv, conta));
      movimentos.push(...linhas);
      porConta.push({ conta: conta.descricao, nCodCC: conta.nCodCC, movimentos: linhas.length });
    } catch (e) {
      porConta.push({ conta: conta.descricao, nCodCC: conta.nCodCC, erro: e.message });
    }
    await sleep(120); // respiro entre contas
  }

  // Dedup por origemOmieId (mesma linha pode vir 2x se períodos sobrepuserem)
  const vistos = new Set();
  const unicos = [];
  for (const m of movimentos) {
    if (vistos.has(m.origemOmieId)) continue;
    vistos.add(m.origemOmieId);
    unicos.push(m);
  }

  const totais = {
    linhas: unicos.length,
    entradaRealizada: unicos.filter((m) => m.tipo === "ENTRADA" && m.realizado).reduce((s, m) => s + m.valor, 0),
    saidaRealizada:   unicos.filter((m) => m.tipo === "SAIDA" && m.realizado).reduce((s, m) => s + m.valor, 0),
    entradaPrevista:  unicos.filter((m) => m.tipo === "ENTRADA" && !m.realizado).reduce((s, m) => s + m.valor, 0),
    saidaPrevista:    unicos.filter((m) => m.tipo === "SAIDA" && !m.realizado).reduce((s, m) => s + m.valor, 0),
  };

  return { contas: alvo.length, porConta, movimentos: unicos, totais };
}
