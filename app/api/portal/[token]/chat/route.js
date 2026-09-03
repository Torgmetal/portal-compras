// POST /api/portal/[token]/chat → o Torguinho do cliente, preso à obra do token
//
// ⚠⚠ O ESCOPO NÃO É PROMPT, É FERRAMENTA. As quatro ferramentas daqui vêm de lib/portal-assistente
// e todas recebem a obra do TOKEN, nunca a que o modelo pedir. O assistente interno e o do cliente
// não compartilham nem rota nem lista de ferramentas — de propósito: um dia alguém acrescenta uma
// ferramenta de custo ao interno, e ela não pode aparecer aqui por herança.
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { secoesDoPortal } from "@/lib/portal-cliente";
import { FERRAMENTAS, executarFerramenta, promptDoCliente } from "@/lib/portal-assistente";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ⚠ o link do portal é público por natureza. Limite por token, apertado: conversa de cliente é de
// uma pergunta por vez, e sem teto um link vazado vira consumo de crédito de IA.
const limiter = createRateLimiter({ name: "portal-chat", maxRequests: 12, windowMs: 60_000 });

const MODELO = "claude-sonnet-4-6";
const MAX_HISTORICO = 12;
const MAX_RODADAS = 5;
const MAX_PERGUNTA = 1000;

export async function POST(req, { params }) {
  const { token } = await params;

  const rl = limiter(req, `portal:${token}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Você está perguntando rápido demais. Aguarde um instante. 🙂" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (!secoesDoPortal(portal).includes("ASSISTENTE")) return NextResponse.json({ error: "Indisponível." }, { status: 403 });

  const op = await prisma.oP.findFirst({
    where: { numero: portal.opNumero },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  if (!op) return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Pergunta inválida." }, { status: 400 }); }

  const mensagens = Array.isArray(body?.mensagens) ? body.mensagens : [];
  if (!mensagens.length) return NextResponse.json({ error: "Escreva a sua pergunta." }, { status: 400 });

  const historico = mensagens.slice(-MAX_HISTORICO).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    // ⚠ corta a pergunta: o campo é aberto ao público, e texto gigante é custo e superfície de abuso.
    content: String(m.content || "").slice(0, MAX_PERGUNTA),
  })).filter((m) => m.content.trim());
  if (!historico.length) return NextResponse.json({ error: "Escreva a sua pergunta." }, { status: 400 });

  const system = promptDoCliente({ obra: op.obra, cliente: op.cliente, opNumero: op.numero });
  const messages = [...historico];
  let resposta = null;

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    let r;
    try {
      r = await anthropic.messages.create({ model: MODELO, max_tokens: 2048, system, tools: FERRAMENTAS, messages });
    } catch (e) {
      console.error("[portal-chat] Anthropic:", e?.status, e?.message);
      resposta = "Tive um problema técnico agora. Tente de novo em instantes. 🙏";
      break;
    }

    const chamadas = r.content.filter((b) => b.type === "tool_use");
    if (chamadas.length) {
      messages.push({ role: "assistant", content: r.content });
      const resultados = await Promise.all(chamadas.map(async (b) => ({
        type: "tool_result",
        tool_use_id: b.id,
        // ⚠ a obra vai daqui, do token — nunca do que o modelo escreveu.
        content: JSON.stringify(await executarFerramenta(b.name, b.input, { opId: op.id, opNumero: op.numero })),
      })));
      messages.push({ role: "user", content: resultados });
      continue;
    }

    resposta = r.content.find((b) => b.type === "text")?.text?.trim()
      || "Não consegui responder isso agora.";
    break;
  }

  return NextResponse.json({ resposta: resposta || "Não consegui responder isso agora." });
}
