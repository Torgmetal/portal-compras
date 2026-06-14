// Validação de prazo de produção: estima o tempo de fabricação de uma obra
// (esforço do comercial OU capacidade real do Syneco) + a cadeia de lead-time
// medida por setor (abertura → abertura no próximo, nível peça) e compara com
// a janela de Fabricação do cronograma. Só para obras com LPC subida.
import { prisma } from "@/lib/prisma";

// Premissas de capacidade da fábrica (espelham a aba Produtividade do comercial)
export const PREMISSAS = { pessoas: 25, horasDia: 8.8 };

// Setores da cadeia para o lead-time (abertura → próximo). Pintura é o fim.
const CADEIA_LEAD = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO"];
const SETOR_SYNECO = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura" };
const ORDEM_SYN = { Corte: 0, Montagem: 1, Solda: 2, Acabamento: 3, Jato: 4, Pintura: 5 };

// Medianas de fallback (dias) caso o Syneco não tenha amostra suficiente
const LEAD_FALLBACK = { CORTE: 22, MONTAGEM: 4, SOLDA: 3, ACABAMENTO: 2, JATO: 2 };

/** Conta dias úteis (seg–sex) entre duas datas, inclusivo. */
export function diasUteis(ini, fim) {
  if (!ini || !fim) return null;
  const a = new Date(ini), b = new Date(fim);
  if (b < a) return 0;
  let n = 0;
  const d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  const end = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** Lead-time mediano por setor (abertura → abertura do próximo) — nível peça,
 *  histórico do Syneco. Robusto a erro de apontamento (não usa dwell). */
export async function leadTimeMedianas() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT obra, item, setor, MIN("dataInicio") ab FROM "MesOrdem"
     WHERE setor = ANY($1) AND "dataInicio" IS NOT NULL AND item IS NOT NULL AND item <> ''
     GROUP BY obra, item, setor`,
    Object.values(SETOR_SYNECO)
  );
  const porPeca = {};
  for (const r of rows) {
    const k = `${r.obra}|${r.item}`;
    (porPeca[k] = porPeca[k] || {})[r.setor] = new Date(r.ab);
  }
  const acc = {};
  for (const k of Object.keys(porPeca)) {
    const m = porPeca[k];
    const pres = Object.keys(m).sort((a, b) => ORDEM_SYN[a] - ORDEM_SYN[b]);
    for (let i = 0; i < pres.length - 1; i++) {
      const g = (m[pres[i + 1]] - m[pres[i]]) / 86400000;
      if (g >= 0 && g < 200) (acc[pres[i]] = acc[pres[i]] || []).push(g);
    }
  }
  const medianas = {};
  for (const [synNome, idx] of Object.entries(ORDEM_SYN)) {
    const key = Object.keys(SETOR_SYNECO).find((k) => SETOR_SYNECO[k] === synNome);
    const arr = (acc[synNome] || []).sort((x, y) => x - y);
    if (key && key !== "PINTURA") {
      medianas[key] = arr.length >= 5 ? Math.round(arr[Math.floor(arr.length / 2)]) : (LEAD_FALLBACK[key] ?? 0);
    }
  }
  return medianas; // { CORTE, MONTAGEM, SOLDA, ACABAMENTO, JATO }
}

/** Capacidade real (kg/dia trabalhado) por setor — últimos 30 dias. */
export async function capacidadePorSetor() {
  const desde = new Date(Date.now() - 30 * 86400000);
  const cap = {};
  for (const [key, syn] of Object.entries(SETOR_SYNECO)) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT DATE("dataInicio"))::int dias, COALESCE(SUM("pesoProduzido"),0) kg
       FROM "MesOrdem" WHERE setor ILIKE '%'||$1||'%' AND "pesoProduzido" > 0 AND "dataInicio" >= $2`,
      syn, desde
    );
    const r = rows[0];
    const dias = Number(r.dias) || 0;
    cap[key] = dias > 0 ? (Number(r.kg) || 0) / dias : 0;
  }
  return cap;
}

/**
 * Estima o prazo de fabricação e valida contra a janela do cronograma.
 * @returns { throughputDias, leadChain, estimadoDias, fonteThroughput, janelaDiasUteis, cabe, faltamDias }
 */
export function calcularPrazo({ pesoKg, hhPorTon, lead, capKgDia, janelaDiasUteis }) {
  const ton = (Number(pesoKg) || 0) / 1000;

  let throughputDias = null, fonteThroughput = null;
  if (hhPorTon > 0) {
    const totalHH = ton * hhPorTon;
    throughputDias = totalHH / (PREMISSAS.pessoas * PREMISSAS.horasDia);
    fonteThroughput = "comercial";
  } else {
    // gargalo: setor mais lento (kg/dia), exceto setores sem base
    const caps = CADEIA_LEAD.concat("PINTURA").map((k) => capKgDia?.[k]).filter((v) => v > 0);
    const gargalo = caps.length ? Math.min(...caps) : 0;
    throughputDias = gargalo > 0 ? (Number(pesoKg) || 0) / gargalo : null;
    fonteThroughput = "benchmark";
  }

  // Lead-time da cadeia (abertura → próximo) é tempo de FLUXO (inclui fila) —
  // serve de referência, NÃO entra no prazo (senão estica obra pequena pra ~33d).
  const leadChain = CADEIA_LEAD.reduce((s, k) => s + (lead?.[k] ?? LEAD_FALLBACK[k] ?? 0), 0);
  // Prazo de execução = esforço (trabalho) em dias úteis.
  const estimadoDias = Math.max(1, Math.ceil(throughputDias || 0));
  const cabe = janelaDiasUteis != null ? estimadoDias <= janelaDiasUteis : null;
  const faltamDias = janelaDiasUteis != null ? Math.max(0, estimadoDias - janelaDiasUteis) : null;

  return {
    throughputDias: throughputDias != null ? Math.round(throughputDias * 10) / 10 : null,
    leadChain,
    estimadoDias,
    fonteThroughput,
    janelaDiasUteis,
    cabe,
    faltamDias,
  };
}

// Extração de dígitos da obra/OP para casar cronograma(T082) ↔ LPC(T82A) ↔ OP(082)
export const digitosObra = (s) => {
  const m = String(s || "").match(/\d+/);
  return m ? m[0].replace(/^0+/, "") : "";
};
