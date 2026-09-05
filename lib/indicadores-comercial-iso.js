// Indicadores ISO do Comercial (Vendas) — LIDOS da planilha manual do Comercial no SharePoint
// (RELATÓRIO_PROPOSTAS_<ano>.xlsx, aba "Indicadores"), não calculados do portal. O Comercial
// preenche a planilha à mão; o portal só espelha os números no mesmo painel dos outros setores.
// Dois indicadores: Taxa de Conversão de Propostas (GERAL, por qtd) e Ciclo Médio de Vendas
// (GERAL). CSAT segue pendente (sem pesquisa). Cache em memória + falha graciosa.
import "server-only";
import * as XLSX from "xlsx";
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { downloadFileByPath } from "@/lib/sharepoint";
import { log } from "@/lib/log";

const registro = log("indicadores-comercial-iso");

const arr12 = () => Array.from({ length: 12 }, () => null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
export const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Caminho da planilha no drive padrão (SHAREPOINT_DRIVE_ID = biblioteca SERVIDOR).
const caminhoPlanilha = (ano) => `/Comercial/1. Orçamento/ORÇAMENTOS_${ano}/RELATÓRIO_PROPOSTAS_${ano}.xlsx`;

// Número a partir de célula (raw number OU texto "R$ 1.234,5" / "24,0%").
const num = (x) => {
  if (typeof x === "number") return x;
  if (x == null) return null;
  const s = String(x).replace(/[R$\s%]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? null : n;
};

// Lê a aba "Indicadores" e extrai as linhas GERAIS que interessam, ancorando por
// faixa=GERAL + descrição (robusto a inserção/remoção de linhas na planilha).
function parseIndicadores(wb) {
  const ws = wb.Sheets["Indicadores"];
  if (!ws) throw new Error('aba "Indicadores" não encontrada na planilha');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  let faixa = "";
  const g = {}; // enviados, convFech, conv, convRes, fech, ciclo, cicloRes, tempo
  for (const row of rows) {
    const c1 = (row[1] == null ? "" : String(row[1])).trim().toUpperCase();
    if (c1) faixa = c1;
    if (faixa !== "GERAL") continue;
    const desc = (row[2] == null ? "" : String(row[2])).trim().toUpperCase();
    const uni = String(row[3] || "");
    const meses = row.slice(4, 16);
    const res = row[16];
    const qtd = /qtd/i.test(uni);
    if (qtd && /ORÇAMENTOS ENVIADOS/.test(desc)) g.enviados = meses;
    else if (qtd && /^ORÇAMENTOS FECHADOS/.test(desc)) g.convFech = meses;   // bloco conversão
    else if (/TAXA DE CONVERS.*QTD/.test(desc)) { g.conv = meses; g.convRes = res; }
    else if (/QTD ORÇAMENTOS FECHADOS/.test(desc)) g.fech = meses;           // bloco ciclo
    else if (/TEMPO PARA FECHAMENTO/.test(desc)) g.tempo = meses;            // bloco ciclo (GERAL)
    else if (/CICLO M[ÉE]DIO DE VENDA/.test(desc)) { g.ciclo = meses; g.cicloRes = res; }
  }
  if (!g.conv && !g.ciclo) throw new Error('linhas GERAIS de conversão/ciclo não encontradas na aba "Indicadores"');
  // Conversão: % só nos meses com propostas enviadas; senão sem dado (null).
  const conversao = arr12().map((_, m) => (num(g.enviados?.[m]) > 0 ? r1(num(g.conv?.[m]) * 100) : null));
  // Ciclo: dias só nos meses com fechamento; senão sem dado.
  const cicloMedio = arr12().map((_, m) => (num(g.fech?.[m]) > 0 ? Math.round(num(g.ciclo?.[m])) : null));
  return {
    series: {
      conversao_propostas: { serie: conversao, acumulado: g.convRes != null ? r1(num(g.convRes) * 100) : null },
      ciclo_medio_vendas: { serie: cicloMedio, acumulado: g.cicloRes != null ? Math.round(num(g.cicloRes)) : null },
    },
    geral: g,
  };
}

// Cache em memória por ano (a planilha muda pouco; evita rebaixar a cada abertura do painel).
const TTL = 10 * 60 * 1000;
const cache = new Map(); // ano -> { at, data }

async function carregar(ano) {
  const hit = cache.get(ano);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let data;
  try {
    const buffer = await downloadFileByPath({ driveId: process.env.SHAREPOINT_DRIVE_ID, fullPath: caminhoPlanilha(ano) });
    const wb = XLSX.read(buffer, { type: "buffer" });
    data = { ...parseIndicadores(wb), erro: null };
  } catch (e) {
    data = { series: null, geral: null, erro: (e?.message || "falha ao ler a planilha").slice(0, 200) };
  }
  cache.set(ano, { at: Date.now(), data });
  return data;
}

/** @returns { indicadores:[{...def, serie, acumulado}], erro } — os 3 indicadores COMERCIAL. */
export async function indicadoresComercialIso(ano) {
  const { series, erro } = await carregar(ano);
  if (erro) registro.erro("[indicadores-comercial-iso]", erro);
  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "COMERCIAL").map((ind) => {
    const s = series?.[ind.id];
    const out = { ...ind, serie: s?.serie || arr12(), acumulado: s?.acumulado ?? null };
    if (erro && ind.fonte === "parcial") out.nota = `⚠ Não consegui ler a planilha agora (${erro}). ${ind.nota || ""}`;
    return out;
  });
  return { indicadores, erro };
}

// Detalhamento (drill-down do card) — componentes mensais da GERAL, direto da planilha.
export async function detalheComercialIso(ano, indicadorId, mesFim = 11) {
  const { geral, erro } = await carregar(ano);
  if (erro || !geral) return null;
  const ateMes = (arr, fn) => { const out = []; for (let m = 0; m <= mesFim; m++) { const l = fn(m); if (l) out.push(l); } return out; };

  if (indicadorId === "conversao_propostas") {
    const linhas = ateMes(null, (m) => {
      const env = num(geral.enviados?.[m]);
      if (!(env > 0)) return null;
      const fe = num(geral.convFech?.[m]) ?? 0;
      const tx = r1(num(geral.conv?.[m]) * 100);
      return [MESES_ABREV[m], String(env), String(fe), `${(tx ?? 0).toLocaleString("pt-BR")}%`];
    });
    const totEnv = linhas.reduce((s, l) => s + Number(l[1]), 0), totFe = linhas.reduce((s, l) => s + Number(l[2]), 0);
    return { titulo: "Taxa de Conversão de Propostas", colunas: ["Mês", "Enviadas", "Fechadas", "Conversão"], linhas,
      resumo: `${totFe} fechadas de ${totEnv} enviadas no ano · conversão ${totEnv > 0 ? (Math.round((totFe / totEnv) * 1000) / 10).toLocaleString("pt-BR") : "0"}%` };
  }

  if (indicadorId === "ciclo_medio_vendas") {
    const linhas = ateMes(null, (m) => {
      const fe = num(geral.fech?.[m]);
      if (!(fe > 0)) return null;
      const t = num(geral.tempo?.[m]) ?? 0, c = Math.round(num(geral.ciclo?.[m]) ?? 0);
      return [MESES_ABREV[m], String(fe), String(Math.round(t)), `${c} dias`];
    });
    const totFe = linhas.reduce((s, l) => s + Number(l[1]), 0), totT = linhas.reduce((s, l) => s + Number(l[2]), 0);
    return { titulo: "Ciclo Médio de Vendas", colunas: ["Mês", "Fechadas", "Dias até fechar", "Ciclo médio"], linhas,
      resumo: `${totFe} propostas fechadas · ciclo médio do ano ${totFe > 0 ? Math.round(totT / totFe) : 0} dias (meta ≤ 60)` };
  }
  return null;
}
