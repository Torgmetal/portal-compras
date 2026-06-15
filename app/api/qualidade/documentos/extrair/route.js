// POST /api/qualidade/documentos/extrair  { base64, tipo }
// Lê o certificado/documento (PDF ou imagem) com o Claude e extrai nº do
// certificado, data de emissão e validade (+ norma). Não inventa — null se não
// achar. Mesmo padrão de extração do kickoff (document/image block + <json>).
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const limiter = createRateLimiter({ name: "qualidade-extrair", maxRequests: 10, windowMs: 60_000 });
const MAX_B64_LEN = 16 * 1024 * 1024;
const MODELO = "claude-sonnet-4-6";
const IMAGENS = ["image/png", "image/jpeg", "image/webp"];

const SYSTEM_PROMPT = `Você lê um CERTIFICADO ou DOCUMENTO de qualidade da indústria metalúrgica (certificado de material/MTC, certificado de parafusaria, consumível de solda, laudo, ASO, certificado de calibração, etc.) e extrai os campos de controle.

EXTRAIA (só o que está escrito; na dúvida use null):
- numeroDocumento: o número do certificado/documento/laudo (ex.: "8186948336", "ASO-2024-014"). Se houver "nº do certificado", "certificate no", "documento nº", use esse. null se não houver.
- dataEmissao: data de emissão do documento, no formato "YYYY-MM-DD". null se não houver.
- dataValidade: data de validade/vencimento, no formato "YYYY-MM-DD". Muitos certificados de material NÃO têm validade — nesse caso null.
- norma: norma/especificação técnica principal citada (ex.: "ASTM A572", "AWS D1.1", "NR-35", "ISO 2808"). null se não houver.

REGRAS:
- Datas SEMPRE no formato YYYY-MM-DD. Converta de DD/MM/AAAA se necessário.
- Não invente. Se o campo não aparece, use null.
- Responda APENAS com JSON entre <json></json>:
<json>{"numeroDocumento": null, "dataEmissao": null, "dataValidade": null, "norma": null}</json>`;

function extractJson(text) {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagged) return tagged[1].trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  return s !== -1 && e > s ? text.slice(s, e + 1) : null;
}

const dataISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

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

  // monta o bloco conforme o tipo (PDF = document; imagem = image; outros não dá)
  let bloco;
  if (tipo === "application/pdf") {
    bloco = { type: "document", source: { type: "base64", media_type: "application/pdf", data: cleanB64 } };
  } else if (IMAGENS.includes(tipo)) {
    bloco = { type: "image", source: { type: "base64", media_type: tipo, data: cleanB64 } };
  } else {
    return NextResponse.json({ success: true, dados: {}, aviso: "Tipo de arquivo não suportado para leitura automática (use PDF ou imagem)." });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [bloco, { type: "text", text: "Extraia os campos de controle conforme o schema." }] }],
    });
    const rawText = (message.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const jsonStr = extractJson(rawText);
    if (!jsonStr) return NextResponse.json({ error: "Não consegui ler o documento." }, { status: 502 });
    let d;
    try { d = JSON.parse(jsonStr); } catch { return NextResponse.json({ error: "Resposta inválida da leitura." }, { status: 502 }); }

    return NextResponse.json({
      success: true,
      dados: {
        numeroDocumento: str(d.numeroDocumento, 100),
        dataEmissao: dataISO(d.dataEmissao),
        dataValidade: dataISO(d.dataValidade),
        norma: str(d.norma, 200),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Falha na leitura: " + (e?.message || "erro") }, { status: 500 });
  }
}
