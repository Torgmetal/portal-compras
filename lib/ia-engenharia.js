// ─── PORTÃO DE IA DA ENGENHARIA — regras puras ───────────────────────────────────────────────────
//
// F1 do app Torg Engenharia (docs/superpowers/specs/2026-10-14-torg-engenharia-app-design.md). Vitor (16/10/2026):
// teto MENSAL por projetista em R$; só ADMIN aprova um PC; Opus 5.5 + Sonnet 5.5 e mais nenhum; guarda-se o consumo e
// o PEDIDO do projetista (não a resposta). Aqui só contas e leitura — banco e rede ficam em lib/ia-portao.js.
import { createHash, randomInt } from "node:crypto";

export const MODELOS_PERMITIDOS = ["claude-opus-5-5", "claude-sonnet-5-5"];

// US$ por MILHÃO de tokens — tabela da Anthropic de 06/10/2026. Cache gravado: 5 min = 1,25× a entrada; 1 hora = 2×.
const PRECOS = {
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLido: 0.2, cacheGravado: 5, cacheGravado1h: 8 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLido: 0.2, cacheGravado: 2.5, cacheGravado1h: 4 },
};

/** Custo em US$ de uma chamada, pelo `usage` que a Anthropic devolve. */
export function custoUsd(modelo, usage = {}) {
  const p = PRECOS[modelo];
  if (!p) throw new Error(`modelo sem preço: ${modelo}`);
  const n = (k) => Number(usage[k]) || 0;
  // ⚠ com o detalhamento (`cache_creation`), cada TTL tem o seu preço; o que o detalhamento não cobrir do total cai em 5 min
  const det = usage.cache_creation && typeof usage.cache_creation === "object" ? usage.cache_creation : null;
  const total = n("cache_creation_input_tokens");
  const h1 = det ? Math.min(Number(det.ephemeral_1h_input_tokens) || 0, total || Infinity) : 0;
  const m5 = Math.max(0, total - h1);
  const gravado = det ? m5 * p.cacheGravado + h1 * p.cacheGravado1h : total * p.cacheGravado;
  return (n("input_tokens") * p.entrada + n("output_tokens") * p.saida + n("cache_read_input_tokens") * p.cacheLido + gravado) / 1e6;
}

/** Etapa do fluxo do app ("1".."6" ou "livre"), vinda do cabeçalho `x-torg-etapa`; qualquer outra coisa → null. */
export const etapaValida = (v) => (typeof v === "string" && /^([1-6]|livre)$/.test(v) ? v : null);
/** Id da conversa (`x-torg-conversa`): 8 a 64 letras, dígitos ou hífen; qualquer outra coisa → null. */
export const conversaValida = (v) => (typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null);

export const usdParaBrl = (usd, cotacao) => Math.round(usd * cotacao * 100) / 100;

// sem 0/O, 1/I/L: o projetista lê o código na tela do app e digita no portal
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const gerarCodigoPareamento = () => `TRG-${Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("")}`;

/** "trg-4f7k", "4f7k", "TRG 4F7K" → "TRG-4F7K"; qualquer outra coisa → null. */
export function normalizarCodigo(texto) {
  const s = String(texto || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^TRG/, "");
  return s.length === 4 && [...s].every((c) => ALFABETO.includes(c)) ? `TRG-${s}` : null;
}

/** O token do aparelho nunca vai ao banco: só este hash. */
export const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");

const MAX_PEDIDO = 2000;
/** O último texto escrito pelo PROJETISTA na conversa — resultados de ferramenta (tool_result) não contam. */
export function pedidoDoProjetista(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const texto = typeof m.content === "string"
      ? m.content
      : (Array.isArray(m.content) ? m.content.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "");
    if (texto.trim()) return texto.trim().slice(0, MAX_PEDIDO);
  }
  return null;
}

/**
 * Lê o `usage` enquanto a resposta passa — em stream (SSE: message_start traz a entrada, message_delta a saída) ou
 * inteira (JSON). Os pedaços chegam cortados em qualquer ponto; o leitor guarda o resto até fechar a linha.
 */
export class LeitorUsage {
  constructor() { this.resto = ""; this.inteiro = ""; this.u = {}; this.viuSse = false; }
  alimentar(texto) {
    this.inteiro += texto.length + this.inteiro.length <= 2_000_000 ? texto : "";
    const linhas = (this.resto + texto).split("\n");
    this.resto = linhas.pop();
    for (const l of linhas) this.#linha(l);
  }
  #linha(l) {
    if (!l.startsWith("data:")) return;
    this.viuSse = true;
    let ev; try { ev = JSON.parse(l.slice(5).trim()); } catch { return; }
    if (ev.type === "message_start" && ev.message?.usage) Object.assign(this.u, ev.message.usage);
    if (ev.type === "message_delta" && ev.usage) Object.assign(this.u, ev.usage);
  }
  usage() {
    if (this.resto) { this.#linha(this.resto); this.resto = ""; }
    let u = this.u;
    if (!this.viuSse) { try { u = JSON.parse(this.inteiro)?.usage || {}; } catch { u = {}; } }
    const n = (k) => Number(u[k]) || 0;
    const r = { input_tokens: n("input_tokens"), output_tokens: n("output_tokens"), cache_read_input_tokens: n("cache_read_input_tokens"), cache_creation_input_tokens: n("cache_creation_input_tokens") };
    const c = u.cache_creation;
    if (c && typeof c === "object") r.cache_creation = { ephemeral_5m_input_tokens: Number(c.ephemeral_5m_input_tokens) || 0, ephemeral_1h_input_tokens: Number(c.ephemeral_1h_input_tokens) || 0 };
    return r;
  }
}

/** Início do mês corrente em São Paulo (UTC−3, sem horário de verão desde 2019), como instante UTC. */
export function inicioDoMesSP(agora = new Date()) {
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1, 3, 0, 0));
}

/**
 * Custo do mês por etapa, a partir de linhas já agrupadas por (etapa, userId, conversa) — o Prisma não conta DISTINCT
 * num groupBy, então a contagem de conversas sai daqui. Etapa nula = "sem etapa" (chamadas antes do app mandar o cabeçalho).
 * Ordem: 1..6, livre, sem etapa. `nomeDe(userId)` traduz o usuário.
 */
export function agruparPorEtapa(linhas, nomeDe = (id) => id) {
  const ORDEM = ["1", "2", "3", "4", "5", "6", "livre", "sem etapa"];
  const novo = (chave) => ({ chave, chamadas: 0, conversas: new Set(), custoBrl: 0, cacheGravado: 0, cacheLido: 0 });
  const soma = (a, l, conversa) => {
    a.chamadas += Number(l._count?._all) || 0;
    a.custoBrl += Number(l._sum?.custoBrl) || 0;
    a.cacheGravado += Number(l._sum?.cacheWriteTokens) || 0;
    a.cacheLido += Number(l._sum?.cacheReadTokens) || 0;
    if (conversa) a.conversas.add(conversa);
  };
  const etapas = new Map();
  for (const l of linhas) {
    const chave = l.etapa || "sem etapa";
    const e = etapas.get(chave) || { ...novo(chave), usuarios: new Map() };
    soma(e, l, l.conversa);
    const uid = l.userId || "—";
    const u = e.usuarios.get(uid) || novo(uid);
    soma(u, l, l.conversa);
    e.usuarios.set(uid, u);
    etapas.set(chave, e);
  }
  const fim = (a) => ({ chamadas: a.chamadas, conversas: a.conversas.size, custoBrl: Math.round(a.custoBrl * 100) / 100, cacheGravado: a.cacheGravado, cacheLido: a.cacheLido });
  return [...etapas.values()]
    .sort((a, b) => ORDEM.indexOf(a.chave) - ORDEM.indexOf(b.chave))
    .map((e) => ({ etapa: e.chave, ...fim(e), usuarios: [...e.usuarios.values()].map((u) => ({ userId: u.chave, usuario: nomeDe(u.chave), ...fim(u) })).sort((a, b) => b.custoBrl - a.custoBrl) }));
}
