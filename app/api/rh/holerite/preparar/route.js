// POST /api/rh/holerite/preparar  { blobUrl, competencia }
// Baixa o PDF multipágina, quebra em 1 página/holerite, sobe cada página como um
// Blob próprio (privado), extrai texto e sugere o funcionário (best-effort).
// NÃO grava nada no banco — devolve a proposta pra tela de revisão do RH commitar.
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { assertBlobUrlSegura } from "@/lib/blob-url";
import { extrairTextos, parseHolerite, matchFuncionario } from "@/lib/holerite-pdf";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  blobUrl: z.string().url(),
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência deve ser AAAA-MM"),
});

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  try { assertBlobUrlSegura(parsed.data.blobUrl); }
  catch { return NextResponse.json({ success: false, error: "Arquivo inválido" }, { status: 400 }); }

  // Baixa o PDF original
  const r = await fetch(parsed.data.blobUrl);
  if (!r.ok) return NextResponse.json({ success: false, error: "Falha ao buscar o PDF" }, { status: 502 });
  const buffer = Buffer.from(await r.arrayBuffer());

  // Funcionários ativos p/ matching (nome/matrícula/cpf)
  const funcionarios = await prisma.funcionario.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, matricula: true, cpf: true },
    orderBy: { nome: "asc" },
  });

  // Só EXTRAI o texto de cada página (rápido) para sugerir o funcionário. NÃO
  // dividimos nem subimos página por página — o PDF completo já está no Blob
  // (blobUrl) e a página de cada holerite é extraída sob demanda quando o
  // funcionário abre no /meu-rh. Isso elimina os dezenas de uploads que
  // estouravam o tempo em PDFs grandes (ex.: VMI).
  let textos;
  try {
    textos = await extrairTextos(buffer);
  } catch (e) {
    return NextResponse.json({ success: false, error: "PDF ilegível: " + (e?.message || "erro") }, { status: 422 });
  }

  const itens = textos.map((texto, i) => {
    const info = parseHolerite(texto || "");
    const sugestao = matchFuncionario(info, funcionarios);
    return {
      pagina: i + 1,
      parse: info,
      funcionarioId: sugestao.confianca >= 0.5 ? sugestao.funcionarioId : null,
      confianca: Number(sugestao.confianca.toFixed(2)),
      motivo: sugestao.motivo,
    };
  });

  return NextResponse.json({
    success: true,
    competencia: parsed.data.competencia,
    totalPaginas: textos.length,
    pdfUrl: parsed.data.blobUrl, // PDF completo — as páginas são extraídas depois
    itens,
    funcionarios, // p/ o dropdown de correção manual
  });
}
