import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// ─── A FRONTEIRA COM O PROVEDOR DE IA ────────────────────────────────────────
//
// ⚠⚠ ESTE É O ÚNICO ARQUIVO DO ASSISTENTE QUE SABE QUE EXISTE UMA ANTHROPIC. O orquestrador, as
// ferramentas e o contrato de evidência falam em `{ mensagens, ferramentas }` e recebem
// `{ texto, chamadas, uso }` — trocar de provedor é reescrever este arquivo, não o motor fiscal.
// Era a exigência do briefing: *"escolha uma arquitetura desacoplada do provedor"*.
//
// ⚠⚠ A CHAVE NUNCA SAI DO SERVIDOR. `server-only` no topo faz o build quebrar se alguém importar
// isto de um componente de cliente — e é uma quebra em tempo de build, não um vazamento em produção.

/** ⚠ O portal inteiro padroniza este modelo (12 outros usos). Trocar só aqui faria o assistente
 *  divergir do resto sem ninguém perceber; por isso é env, e o padrão é o do portal. */
export const MODELO = process.env.FISCAL_IA_MODELO || "claude-sonnet-4-6";

/**
 * ⚠⚠ PREÇO É DADO OPERACIONAL, NÃO CONSTANTE DE CÓDIGO — e o Codex pediu que a versão da tabela de
 * preço entrasse na rastreabilidade: um custo gravado hoje só é interpretável se dá para saber
 * contra qual tabela ele foi calculado. Em reais por milhão de tokens.
 */
export const PRECOS = {
  versao: process.env.FISCAL_IA_PRECO_VERSAO || "2026-09",
  entradaPorMilhao: Number(process.env.FISCAL_IA_PRECO_ENTRADA_BRL ?? 16.5),
  saidaPorMilhao: Number(process.env.FISCAL_IA_PRECO_SAIDA_BRL ?? 82.5),
};

/** Em MICROS de real, inteiro — a mesma unidade do orçamento. */
export function custoMicros({ entrada = 0, saida = 0 }) {
  return Math.round((entrada * PRECOS.entradaPorMilhao + saida * PRECOS.saidaPorMilhao));
}

export const configurado = () => Boolean(process.env.ANTHROPIC_API_KEY);

let cliente = null;
const obter = () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada.");
  cliente ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cliente;
};

/**
 * Uma rodada com o modelo. Devolve sempre a mesma forma, com ou sem uso de ferramenta.
 *
 * ⚠⚠ `ateMs` É PRAZO ABSOLUTO, NÃO TIMEOUT POR TENTATIVA — mesma lição do `omieCall`: uma chamada
 * iniciada com 1 s de orçamento ainda podia levar minutos, que é como a Vercel mata a rota e o
 * navegador recebe HTML no lugar de JSON.
 */
export async function rodada({ sistema, mensagens, ferramentas, ateMs, maxTokens = 2000 }) {
  const restante = ateMs ? ateMs - Date.now() : 60_000;
  if (restante <= 1_000) throw new Error("Sem tempo restante para consultar o modelo.");

  // ⚠⚠⚠ `timeout` DO SDK É POR TENTATIVA, E ELE RETENTA SOZINHO (achado do Codex, 24/09/2026). O
  // `@anthropic-ai/sdk` 0.30.1 usa `maxRetries: 2` por padrão e REPETE a requisição com as mesmas
  // opções depois de um timeout — então um prazo de 45 s vira até 135 s de relógio, a Vercel mata
  // a rota nos 60 s e a resposta morre no meio, depois de a chamada já ter sido paga.
  //
  // ⚠⚠ Por isso `maxRetries: 0` **e** um `AbortSignal` amarrado ao prazo ABSOLUTO: o primeiro tira
  // a retentativa das mãos do SDK, o segundo garante o corte mesmo que alguma camada de transporte
  // demore além do `timeout`. Retentar é decisão do orquestrador, que é quem sabe quanto tempo
  // sobra para GRAVAR a resposta — e gravar não pode ficar sem orçamento.
  const corte = AbortSignal.timeout(Math.min(restante, 120_000));

  const r = await obter().messages.create({
    model: MODELO,
    max_tokens: maxTokens,
    // ⚠⚠ O SISTEMA VAI EM BLOCO CACHEÁVEL: ele é grande (catálogo de CFOPs e as regras de conduta)
    // e idêntico em toda mensagem. Sem cache, cada pergunta paga o catálogo inteiro de novo.
    system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
    messages: mensagens,
    tools: ferramentas,
  }, {
    timeout: Math.min(restante, 120_000),
    maxRetries: 0,
    signal: corte,
  });

  const texto = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  const chamadas = r.content.filter((c) => c.type === "tool_use").map((c) => ({ id: c.id, nome: c.name, argumentos: c.input }));
  return {
    texto, chamadas, bruto: r.content, parada: r.stop_reason, modelo: r.model,
    uso: {
      entrada: (r.usage?.input_tokens ?? 0) + (r.usage?.cache_creation_input_tokens ?? 0) + (r.usage?.cache_read_input_tokens ?? 0),
      saida: r.usage?.output_tokens ?? 0,
      // ⚠ O cache é contabilizado separado porque é ele que justifica o desenho: leitura cacheada
      // custa uma fração da escrita, e sem medir não dá para saber se o cache está pegando.
      cacheEscrito: r.usage?.cache_creation_input_tokens ?? 0,
      cacheLido: r.usage?.cache_read_input_tokens ?? 0,
    },
  };
}
