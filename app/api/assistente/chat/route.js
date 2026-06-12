import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getToolsParaUser } from "@/lib/assistente/tools";
import { executarTool } from "@/lib/assistente/executar-tools";
import { buildSystemPrompt } from "@/lib/assistente/system-prompt";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// Tempo máximo para o loop de tool use (Vercel limit)
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Rate-limit por usuário — cada request faz até MAX_TOOL_ROUNDS chamadas
// Anthropic, então limitar a frequência evita queima de créditos.
const limiter = createRateLimiter({ name: "assistente-chat", maxRequests: 15, windowMs: 60_000 });

// Modelos: Haiku no geral (barato); Sonnet quando a pergunta é complexa /
// cruza módulos (melhor raciocínio multi-etapa).
const MODELO_SIMPLES = "claude-haiku-4-5";
const MODELO_COMPLEXO = "claude-sonnet-4-6";

// Máximo de mensagens do histórico enviadas ao Claude (controle de custo)
const MAX_HISTORICO = 20;

// Máximo de rodadas de tool use por pergunta (evita loops infinitos).
// Perguntas que cruzam módulos precisam de várias rodadas encadeadas.
const MAX_TOOL_ROUNDS = 10;

// Heurística: a pergunta exige raciocínio multi-etapa / cruzamento de módulos?
function perguntaComplexa(texto) {
  const t = String(texto || "").toLowerCase();
  if (t.length > 160) return true;
  return /\b(cada|todos|todas|quais|liste|listar|relat[óo]rio|cruz|atras|atrasad|pendent|faltam?|por (projeto|obra|cliente|fornecedor|categoria|setor)|agrup|compar|soma|somat|total de|m[ée]dia)\b/.test(t);
}

export async function POST(req) {
  // ─── Auth ─────────────────────────────────────────────────────
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const user = session.user;

  // ─── Rate limit por usuário ───────────────────────────────────
  const rl = limiter(req, `user:${user.id}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Você está enviando mensagens rápido demais. Aguarde um instante." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  // ─── Body ─────────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { mensagens } = body;
  if (!Array.isArray(mensagens) || mensagens.length === 0) {
    return NextResponse.json({ error: "Campo 'mensagens' obrigatório" }, { status: 400 });
  }

  // Limita histórico enviado ao Claude
  const historico = mensagens.slice(-MAX_HISTORICO).map((m) => ({
    role:    m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));

  // ─── Carrega config do banco (modelo + instrução extra) ───────
  let configDb = null;
  try {
    configDb = await prisma.configAssistente.findFirst();
  } catch { /* usa defaults se banco indisponível */ }

  // Modelo: respeita override explícito do admin; senão escolhe pela pergunta.
  const ultimaPergunta = [...historico].reverse().find((m) => m.role === "user")?.content || "";
  const modeloForcado = configDb?.modelo || null;
  let modelo = modeloForcado || (perguntaComplexa(ultimaPergunta) ? MODELO_COMPLEXO : MODELO_SIMPLES);

  // ─── Ferramentas disponíveis para este usuário ─────────────────
  const tools = getToolsParaUser(user);
  const systemPrompt = buildSystemPrompt(user, configDb?.instrucaoExtra);

  // ─── Loop de tool use ──────────────────────────────────────────
  let messages = [...historico];
  let rodada = 0;
  let respostaFinal = null;

  while (rodada < MAX_TOOL_ROUNDS) {
    rodada++;

    // Se já passou de 2 rodadas de ferramenta e o admin não forçou modelo,
    // a pergunta se mostrou complexa — escala pro Sonnet no restante.
    if (!modeloForcado && rodada >= 3 && modelo === MODELO_SIMPLES) modelo = MODELO_COMPLEXO;

    const response = await anthropic.messages.create({
      model:      modelo,
      max_tokens: modelo === MODELO_COMPLEXO ? 4096 : 1500,
      system:     systemPrompt,
      tools,
      messages,
    });

    // Claude terminou — resposta de texto
    if (response.stop_reason === "end_turn") {
      const textoBlock = response.content.find((b) => b.type === "text");
      respostaFinal = textoBlock?.text || "Desculpe, não consegui gerar uma resposta.";
      break;
    }

    // Claude quer usar ferramentas
    if (response.stop_reason === "tool_use") {
      // Adiciona a resposta do assistente (com os blocos tool_use) ao histórico
      messages.push({ role: "assistant", content: response.content });

      // Executa cada tool call em paralelo
      const toolBlocks = response.content.filter((b) => b.type === "tool_use");
      const resultados = await Promise.all(
        toolBlocks.map(async (block) => {
          const resultado = await executarTool(block.name, block.input, user);
          return {
            type:        "tool_result",
            tool_use_id: block.id,
            content:     JSON.stringify(resultado),
          };
        })
      );

      // Adiciona os resultados como mensagem do usuário
      messages.push({ role: "user", content: resultados });
      continue;
    }

    // Outro stop_reason inesperado
    respostaFinal = "Não consegui processar sua solicitação. Tente novamente.";
    break;
  }

  if (!respostaFinal) {
    respostaFinal = "Atingi o limite de consultas para esta resposta. Tente uma pergunta mais específica.";
  }

  return NextResponse.json({ resposta: respostaFinal });
}
