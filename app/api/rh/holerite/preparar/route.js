// POST /api/rh/holerite/preparar  { blobUrl, competencia }
// Baixa o PDF multipágina, quebra em 1 página/holerite, sobe cada página como um
// Blob próprio (privado), extrai texto e sugere o funcionário (best-effort).
// NÃO grava nada no banco — devolve a proposta pra tela de revisão do RH commitar.
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { assertBlobUrlSegura } from "@/lib/blob-url";
import { splitPaginas, extrairTextos, parseHolerite, matchFuncionario } from "@/lib/holerite-pdf";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300; // PDFs grandes (até 50MB / dezenas de páginas): split + extração + upload por página

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

  let paginas, textos;
  try {
    [paginas, textos] = await Promise.all([splitPaginas(buffer), extrairTextos(buffer)]);
  } catch (e) {
    return NextResponse.json({ success: false, error: "PDF ilegível: " + (e?.message || "erro") }, { status: 422 });
  }

  // Sobe cada página individual no Blob (privada, sufixo aleatório) e monta a
  // proposta. EM PARALELO (lotes) — um holerite mensal tem 1 página por
  // funcionário (dezenas), e uploads sequenciais estouravam o limite de tempo.
  const itens = new Array(paginas.length);
  const CONCORRENCIA = 20; // uploads são I/O-bound — mais paralelismo derruba o tempo total
  try {
    for (let inicio = 0; inicio < paginas.length; inicio += CONCORRENCIA) {
      const lote = paginas.slice(inicio, inicio + CONCORRENCIA);
      await Promise.all(lote.map(async (p) => {
        const info = parseHolerite(textos[p.index] || "");
        const sugestao = matchFuncionario(info, funcionarios);
        const nomeArq = `holerite-${parsed.data.competencia}-p${String(p.index + 1).padStart(2, "0")}.pdf`;
        const blob = await put(`holerites/${parsed.data.competencia}/${nomeArq}`, Buffer.from(p.bytes), {
          access: "public", // URL com sufixo aleatório; servida só via proxy autenticado
          addRandomSuffix: true,
          contentType: "application/pdf",
        });
        itens[p.index] = {
          pagina: p.index + 1,
          arquivoUrl: blob.url,
          arquivoNome: nomeArq,
          arquivoTamanho: p.bytes.length,
          parse: info,
          funcionarioId: sugestao.confianca >= 0.5 ? sugestao.funcionarioId : null,
          confianca: Number(sugestao.confianca.toFixed(2)),
          motivo: sugestao.motivo,
        };
      }));
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao subir as páginas: " + (e?.message || "erro") }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    competencia: parsed.data.competencia,
    totalPaginas: paginas.length,
    itens,
    funcionarios, // p/ o dropdown de correção manual
  });
}
