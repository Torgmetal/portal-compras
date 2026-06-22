// POST /api/planejamento/extrair-tarefas — lê UMA ou VÁRIAS atas/transcrições
// (texto colado e/ou arquivos PDF/TXT no Blob) e extrai as tarefas por setor com
// IA, consolidando itens repetidos entre documentos (não salva nada).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { extrairTarefas } from "@/lib/extrair-tarefas";

export const runtime = "nodejs";
export const maxDuration = 120;

const docSchema = z.object({
  nome: z.string().max(200).optional().nullable(),
  texto: z.string().max(60000).optional().nullable(),
  arquivoUrl: z.string().url().optional().nullable(),
  arquivoTipo: z.string().optional().nullable(),
});

const schema = z.object({
  // novo formato: lista de documentos
  documentos: z.array(docSchema).min(1).max(10).optional(),
  // compat com o formato antigo (1 doc):
  texto: z.string().max(60000).optional().nullable(),
  arquivoUrl: z.string().url().optional().nullable(),
  arquivoTipo: z.string().optional().nullable(),
});

// resolve um descritor de documento em { nome, texto? | pdfBase64? }
async function resolverDoc(d) {
  if (d.arquivoUrl) {
    // só aceita do Blob da Vercel (anti-SSRF)
    if (!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(d.arquivoUrl)) {
      throw new Error("Origem de arquivo não permitida.");
    }
    const ehPdf = /pdf/i.test(d.arquivoTipo || "") || /\.pdf(\?|$)/i.test(d.arquivoUrl);
    const r = await fetch(d.arquivoUrl);
    if (!r.ok) throw new Error("Não foi possível ler um dos arquivos enviados.");
    if (ehPdf) return { nome: d.nome || null, pdfBase64: Buffer.from(await r.arrayBuffer()).toString("base64") };
    return { nome: d.nome || null, texto: (await r.text()).slice(0, 60000) }; // txt/csv
  }
  if (d.texto && d.texto.trim()) return { nome: d.nome || "Texto colado", texto: d.texto.trim() };
  return null;
}

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // monta a lista de descritores (novo formato ou compat antigo)
  const lista = Array.isArray(body.documentos) && body.documentos.length
    ? body.documentos
    : [{ texto: body.texto, arquivoUrl: body.arquivoUrl, arquivoTipo: body.arquivoTipo }];

  const documentos = [];
  for (const d of lista) {
    let doc;
    try { doc = await resolverDoc(d); }
    catch (e) { return NextResponse.json({ error: e.message || "Falha ao ler um arquivo. Tente colar o texto." }, { status: 400 }); }
    if (doc) documentos.push(doc);
  }

  if (!documentos.length) {
    return NextResponse.json({ error: "Cole o texto da ata/transcrição ou envie ao menos um arquivo (PDF/TXT)." }, { status: 400 });
  }

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD em BRT
  try {
    const { resumo, tarefas } = await extrairTarefas({ documentos, hoje });
    return NextResponse.json({ success: true, resumo, tarefas, totalDocumentos: documentos.length });
  } catch (e) {
    return NextResponse.json({ error: "Erro ao analisar com a IA: " + (e?.message || "") }, { status: 502 });
  }
}
