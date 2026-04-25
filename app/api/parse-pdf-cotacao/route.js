import { NextResponse } from "next/server";
import { parseCotacaoText } from "@/lib/pdf-parser-server";

// Roda em Node (precisa de pdf-parse, que usa libs nativas)
export const runtime = "nodejs";
// Permite até ~30s pra processar PDFs grandes
export const maxDuration = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    const { base64 } = body;
    if (!base64 || typeof base64 !== "string") {
      return NextResponse.json({ error: "Campo 'base64' obrigatório" }, { status: 400 });
    }

    // Aceita data URL completa ("data:application/pdf;base64,...") ou só o base64
    const cleanBase64 = base64.includes(",") ? base64.split(",")[1] : base64;
    const buffer = Buffer.from(cleanBase64, "base64");

    if (buffer.length === 0) {
      return NextResponse.json({ error: "Buffer do PDF vazio" }, { status: 400 });
    }

    // Import dinâmico — pdf-parse roda um teste no require padrão; usar o
    // arquivo direto em /lib evita esse comportamento
    const pdfParseMod = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = pdfParseMod.default || pdfParseMod;
    const data = await pdfParse(buffer);
    const text = data.text || "";

    const parsed = parseCotacaoText(text);

    return NextResponse.json({
      ...parsed,
      _meta: {
        pages: data.numpages,
        textLength: text.length,
        bytesIn: buffer.length,
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
