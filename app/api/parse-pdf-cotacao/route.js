import { NextResponse } from "next/server";
import { parseCotacaoText } from "@/lib/pdf-parser-server";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// Roda em Node — unpdf precisa de APIs Node mas funciona em serverless
export const runtime = "nodejs";
export const maxDuration = 30;

// Rota pública (portal do fornecedor) — rate-limit por IP contra DoS de CPU.
const limiter = createRateLimiter({ name: "parse-pdf-cotacao", maxRequests: 10, windowMs: 60_000 });
const MAX_BASE64_LEN = 16 * 1024 * 1024; // ~12MB de PDF

export async function POST(request) {
  const rl = limiter(request);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await request.json();
    const { base64 } = body;
    if (!base64 || typeof base64 !== "string") {
      return NextResponse.json({ error: "Campo 'base64' obrigatório" }, { status: 400 });
    }
    if (base64.length > MAX_BASE64_LEN) {
      return NextResponse.json({ error: "Arquivo grande demais (máx ~12MB)" }, { status: 413 });
    }

    // Aceita data URL completa ("data:application/pdf;base64,...") ou só o base64
    const cleanBase64 = base64.includes(",") ? base64.split(",")[1] : base64;
    const buffer = Buffer.from(cleanBase64, "base64");

    if (buffer.length === 0) {
      return NextResponse.json({ error: "Buffer do PDF vazio" }, { status: 400 });
    }

    // unpdf é otimizado pra serverless e não tem os bugs do pdf-parse
    const { extractText } = await import("unpdf");
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
    const text = String(result.text || "");

    if (!text) {
      return NextResponse.json(
        {
          fornecedor: "",
          formato: "vazio",
          prazoPagamento: "",
          itens: [],
          avisos: ["PDF não retornou texto extraível (pode ser PDF escaneado/imagem)"],
          _meta: { pages: result.totalPages, textLength: 0, bytesIn: buffer.length },
        },
        { status: 200 }
      );
    }

    const parsed = parseCotacaoText(text);

    // Quando não casou nenhum item, devolve um preview do texto pra debug
    const debugPreview = parsed.itens.length === 0 ? text.slice(0, 500) : undefined;

    return NextResponse.json({
      ...parsed,
      _meta: {
        pages: result.totalPages,
        textLength: text.length,
        bytesIn: buffer.length,
        ...(debugPreview ? { textPreview: debugPreview } : {}),
      },
    });
  } catch (err) {
    console.error("parse-pdf-cotacao failed:", err);
    return NextResponse.json(
      { error: err?.message || "Falha ao processar PDF" },
      { status: 500 }
    );
  }
}
