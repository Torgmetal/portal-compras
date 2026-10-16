// ─── PORTÃO DE IA DA ENGENHARIA — regras puras ───────────────────────────────────────────────────
//
// F1 do app Torg Engenharia (docs/superpowers/specs/2026-10-14-torg-engenharia-app-design.md). Vitor (16/10/2026):
// teto MENSAL por projetista em R$; só ADMIN aprova um PC; Opus 5.5 + Sonnet 5.5 e mais nenhum; guarda-se o consumo e
// o PEDIDO do projetista (não a resposta). Aqui só contas e leitura — banco e rede ficam em lib/ia-portao.js.
import { createHash, randomInt } from "node:crypto";

export const MODELOS_PERMITIDOS = ["claude-opus-5-5", "claude-sonnet-5-5"];

// US$ por MILHÃO de tokens — tabela da Anthropic de 06/10/2026. Cache gravado (5 min) = 1,25× a entrada.
const PRECOS = {
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLido: 0.2, cacheGravado: 5 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLido: 0.2, cacheGravado: 2.5 },
};

/** Custo em US$ de uma chamada, pelo `usage` que a Anthropic devolve. */
export function custoUsd(modelo, usage = {}) {
  const p = PRECOS[modelo];
  if (!p) throw new Error(`modelo sem preço: ${modelo}`);
  const n = (k) => Number(usage[k]) || 0;
  return (n("input_tokens") * p.entrada + n("output_tokens") * p.saida
    + n("cache_read_input_tokens") * p.cacheLido + n("cache_creation_input_tokens") * p.cacheGravado) / 1e6;
}

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
    return { input_tokens: n("input_tokens"), output_tokens: n("output_tokens"), cache_read_input_tokens: n("cache_read_input_tokens"), cache_creation_input_tokens: n("cache_creation_input_tokens") };
  }
}

/** Início do mês corrente em São Paulo (UTC−3, sem horário de verão desde 2019), como instante UTC. */
export function inicioDoMesSP(agora = new Date()) {
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1, 3, 0, 0));
}
