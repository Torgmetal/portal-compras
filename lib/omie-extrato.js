// Extrato de conta corrente do Omie (financas/extrato → ListarExtrato) para o
// Fluxo de Caixa. Traz REALIZADO (cSituacao Conciliado/Não conciliado) e
// PREVISTO (cSituacao Previsto) — inclusive transferências entre contas.
//
// Cada movimento: nValorDocumento COM SINAL (negativo=saída, positivo=entrada),
// cSituacao, cOrigem, cDesCategoria, cRazCliente, dDataLancamento, nCodLancamento.

import { prismaDirect } from "./prisma.js";
import { omieCall } from "./omie-call.js";

const URL_CC      = "https://app.omie.com.br/api/v1/geral/contacorrente/";
const URL_EXTRATO = "https://app.omie.com.br/api/v1/financas/extrato/";

const omie = (url, call, param) => omieCall(url, call, param, { timeout: 50000 });

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
  // Transferência entre contas próprias (origem "Crédito/Débito de Transferência").
  const transferencia = /transfer/i.test(mv.cOrigem || "") || /transfer/i.test(mv.cDesCategoria || "");
  return {
    origemOmieId: `EXT-${conta.nCodCC}-${mv.nCodLancamento}`,
    contaCorrente: conta.descricao,
    nCodCC: conta.nCodCC,
    data,
    tipo: valorAssinado < 0 ? "SAIDA" : "ENTRADA",
    valor: Math.abs(valorAssinado),
    realizado,
    transferencia,
    dataRealizado: realizado ? data : null,
    situacao: mv.cSituacao || null,            // Conciliado / Não conciliado / Previsto
    origem: mv.cOrigem || null,                // Conta Paga / Débito de Transferência / Previsão de ...
    categoria: transferencia ? "Transferência" : ((mv.cDesCategoria || mv.cOrigem || "").trim() || null),
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
  // Contas reais de caixa/banco/aplicação. Exclui "AD" (Adiantamento ao
  // Fornecedor — controle contábil, não é caixa). (cFluxoCaixa não vem nesta
  // listagem; só no cabeçalho do extrato — por isso filtramos por tipo.)
  const alvo = contas.filter((c) => c.nCodCC && c.tipo !== "AD");

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

  // Totais "de caixa" excluem transferências entre contas próprias (não são
  // entrada/saída reais). As transferências vão num total à parte.
  const real = unicos.filter((m) => !m.transferencia);
  const soma = (arr, tipo, realiz) => arr.filter((m) => m.tipo === tipo && m.realizado === realiz).reduce((s, m) => s + m.valor, 0);
  const totais = {
    linhas: unicos.length,
    transferencias: unicos.filter((m) => m.transferencia).length,
    entradaRealizada: soma(real, "ENTRADA", true),
    saidaRealizada:   soma(real, "SAIDA", true),
    entradaPrevista:  soma(real, "ENTRADA", false),
    saidaPrevista:    soma(real, "SAIDA", false),
  };

  return { contas: alvo.length, porConta, movimentos: unicos, totais };
}

/**
 * Importa o extrato do período para a tabela FluxoCaixa (reconcilia: apaga as
 * linhas de origem Omie do período e regrava). Lançamentos manuais (origemOmieId
 * nulo) NÃO são tocados.
 * @param {{ de: string, ate: string, userId?: string }} opts
 */
export async function importarFluxoExtrato({ de, ate, userId }) {
  const { movimentos, totais, contas, porConta } = await listarFluxoExtrato({ de, ate });

  const deInicio = new Date(`${de}T00:00:00.000-03:00`);
  const ateFim   = new Date(`${ate}T23:59:59.999-03:00`);

  // Reconciliação: remove só as linhas importadas do Omie nesse período.
  const apagados = await prismaDirect.fluxoCaixa.deleteMany({
    where: { origemOmieId: { not: null }, data: { gte: deInicio, lte: ateFim } },
  });

  const dados = movimentos.filter((m) => m.data).map((m) => ({
    data: m.data,
    tipo: m.tipo,
    categoria: m.categoria || "Outros",
    descricao: m.descricao || "Movimento",
    valor: m.valor,
    realizado: m.realizado,
    dataRealizado: m.dataRealizado,
    origemOmieId: m.origemOmieId,
    contaCorrente: m.contaCorrente,
    contraparte: m.cliente,
    transferencia: m.transferencia,
    observacao: [m.contaCorrente, m.origem, m.situacao].filter(Boolean).join(" · "),
    createdById: userId || null,
  }));

  let criados = 0;
  for (let i = 0; i < dados.length; i += 500) {
    const lote = dados.slice(i, i + 500);
    await prismaDirect.fluxoCaixa.createMany({ data: lote });
    criados += lote.length;
  }

  return { criados, apagados: apagados.count, totais, contas, porConta };
}
