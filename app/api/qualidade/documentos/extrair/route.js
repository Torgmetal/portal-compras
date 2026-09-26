// POST /api/qualidade/documentos/extrair  { base64, tipo }
// Lê o certificado/documento (PDF ou imagem) com o Claude e extrai nº do
// certificado, data de emissão e validade (+ norma). Não inventa — null se não
// achar. A leitura é a mesma do import do servidor: lib/extrair-doc-qualidade.
import { NextResponse } from "next/server";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { requireRole } from "@/lib/session";
import { extrairDadosDocumento } from "@/lib/extrair-doc-qualidade";

export const runtime = "nodejs";
export const maxDuration = 60;

const limiter = createRateLimiter({ name: "qualidade-extrair", maxRequests: 10, windowMs: 60_000 });
const MAX_B64_LEN = 16 * 1024 * 1024;
const IMAGENS = ["image/png", "image/jpeg", "image/webp"];

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const rl = limiter(req, `user:${user.id}`);
  if (!rl.success) return NextResponse.json({ error: "Muitas extrações — aguarde um minuto." }, { status: 429, headers: rateLimitHeaders(rl) });

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada." }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }
  const tipo = String(body.tipo || "");
  const base64 = String(body.base64 || "");
  const cleanB64 = base64.includes(",") ? base64.split(",")[1] : base64;
  if (!cleanB64) return NextResponse.json({ error: "base64 obrigatório" }, { status: 400 });
  if (cleanB64.length > MAX_B64_LEN) return NextResponse.json({ error: "Arquivo grande demais para ler." }, { status: 413 });

  // PDF e imagem a leitura entende; outros tipos, não
  if (tipo !== "application/pdf" && !IMAGENS.includes(tipo)) {
    return NextResponse.json({ success: true, dados: {}, aviso: "Tipo de arquivo não suportado para leitura automática (use PDF ou imagem)." });
  }

  try {
    const dados = await extrairDadosDocumento(cleanB64, tipo);
    if (!Object.keys(dados).length) return NextResponse.json({ error: "Não consegui ler o documento." }, { status: 502 });
    return NextResponse.json({ success: true, dados });
  } catch (e) {
    return NextResponse.json({ error: "Falha na leitura: " + (e?.message || "erro") }, { status: 500 });
  }
}
