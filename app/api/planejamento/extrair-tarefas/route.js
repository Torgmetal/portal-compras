// POST /api/planejamento/extrair-tarefas — lê uma ata/transcrição (texto colado)
// ou um arquivo (PDF/TXT no Blob) e extrai as tarefas por setor com IA (não salva).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { extrairTarefas } from "@/lib/extrair-tarefas";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  texto: z.string().max(60000).optional().nullable(),
  arquivoUrl: z.string().url().optional().nullable(),
  arquivoTipo: z.string().optional().nullable(),
});

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  let texto = (body.texto || "").trim();
  let pdfBase64 = null;

  if (body.arquivoUrl) {
    // só aceita do Blob da Vercel (anti-SSRF)
    if (!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(body.arquivoUrl)) {
      return NextResponse.json({ error: "Origem de arquivo não permitida." }, { status: 400 });
    }
    const ehPdf = /pdf/i.test(body.arquivoTipo || "") || /\.pdf(\?|$)/i.test(body.arquivoUrl);
    try {
      const r = await fetch(body.arquivoUrl);
      if (!r.ok) throw new Error("não foi possível ler o arquivo");
      if (ehPdf) pdfBase64 = Buffer.from(await r.arrayBuffer()).toString("base64");
      else texto = (await r.text()).slice(0, 60000); // txt/csv
    } catch {
      return NextResponse.json({ error: "Falha ao ler o arquivo enviado. Tente colar o texto." }, { status: 400 });
    }
  }

  if (!texto && !pdfBase64) {
    return NextResponse.json({ error: "Cole o texto da ata/transcrição ou envie um arquivo (PDF/TXT)." }, { status: 400 });
  }

  try {
    const { resumo, tarefas } = await extrairTarefas({ texto: texto || null, pdfBase64 });
    return NextResponse.json({ success: true, resumo, tarefas });
  } catch (e) {
    return NextResponse.json({ error: "Erro ao analisar com a IA: " + (e?.message || "") }, { status: 502 });
  }
}
