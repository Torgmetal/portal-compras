// GET — o PDF do relatório, com as fotos e o quadro de assinaturas.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarRelatorioInspecaoPDF } from "@/lib/relatorio-inspecao-pdf";
import { baixarDesenho } from "@/lib/relatorio-dimensional";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id } });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  const fotos = await prisma.fotoInspecao.findMany({
    where: { relatorioId: id },
    orderBy: { capturadaEm: "asc" },
    select: { url: true, marca: true, origemMarca: true, observacao: true, capturadaEm: true, autorNome: true },
  });

  const assinaturas = rel.envioAssinaturaId
    ? await prisma.assinaturaDocumento.findMany({
        where: { envioId: rel.envioAssinaturaId },
        select: { nome: true, setor: true, assinadoEm: true, ip: true },
        orderBy: { nome: "asc" },
      })
    : null;

  const bytes = await gerarRelatorioInspecaoPDF({ rel, fotos, assinaturas, desenhoBytes: (d) => baixarDesenho(d?.caminho) });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${rel.codigo}.pdf"`,
    },
  });
}
