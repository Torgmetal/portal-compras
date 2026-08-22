// GET /api/qualidade/data-books/[id]/pdf[?inline=1]
// Gera e transmite o PDF do Data Book (capa + lista mestra + seções + merge dos
// certificados). Só ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { gerarDataBookPDF } from "@/lib/databook-pdf";
import { montarRoteiro } from "@/lib/databook-volumes";

// Acima disto o arquivo único deixa de ser entregável: não fecha dentro da função e
// o leitor de PDF do cliente engasga. O caminho passa a ser gerar em volumes.
const MAX_ANEXOS_ARQUIVO_UNICO = 300;

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  // Data book grande não sai em arquivo único — e é melhor dizer isso agora do que
  // deixar a função rodar até o timeout e devolver erro genérico.
  try {
    const { roteiro } = await montarRoteiro(params.id);
    if (roteiro.length > MAX_ANEXOS_ARQUIVO_UNICO) {
      const volumes = await prisma.dataBookArquivo.count({ where: { dataBookId: params.id } });
      return NextResponse.json({
        error: `Este data book tem ${roteiro.length.toLocaleString("pt-BR")} anexos — não cabe em um arquivo só.`,
        detalhe: volumes ? "Baixe pelos volumes já gerados." : "Use “Gerar volumes” para montar o data book em volumes.",
        emVolumes: true,
      }, { status: 409 });
    }
  } catch { /* se o roteiro falhar, segue e deixa a geração dizer o que houve */ }

  let out;
  try {
    out = await gerarDataBookPDF(params.id);
  } catch (e) {
    return NextResponse.json({ error: "Falha ao gerar o PDF: " + e.message }, { status: 500 });
  }

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const nome = out.filename.replace(/["\r\n]/g, "");
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${nome}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(Buffer.from(out.bytes), { status: 200, headers });
}
