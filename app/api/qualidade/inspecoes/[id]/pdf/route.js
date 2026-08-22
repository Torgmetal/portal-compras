// GET — o PDF do relatório, com as fotos e o quadro de assinaturas.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarRelatorioInspecaoPDF } from "@/lib/relatorio-inspecao-pdf";
import { baixarDesenho, garantirDesenhos } from "@/lib/relatorio-dimensional";
import { gerarDimensionalPDF } from "@/lib/relatorio-dimensional-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id } });
  // ⚠ idem à tela de marcação: se o relatório nasceu sem desenho (criação instantânea), resolve e
  // grava aqui. Sem isto o PDF sairia com o campo do croqui em branco.
  if (rel && rel.tipo === "DIMENSIONAL") rel.desenhos = await garantirDesenhos(rel);
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

  // ⚠ o DIMENSIONAL tem formulário próprio. Vitor: "quando gerar o relatório ele precisa ficar com
  // a cara de relatório do excel" — os outros tipos seguem o layout de evidências fotográficas.
  let bytes;
  if (rel.tipo === "DIMENSIONAL") {
    const op = await prisma.oP.findFirst({ where: { numero: rel.opNumero }, select: { cliente: true, obra: true, refCliente: true } });
    bytes = await gerarDimensionalPDF({
      rel, assinaturas,
      desenhoBytes: (d) => baixarDesenho(d?.caminho),
      cliente: op?.cliente || null, obra: op?.obra || null, refCliente: op?.refCliente || null,
    });
  } else {
    bytes = await gerarRelatorioInspecaoPDF({ rel, fotos, assinaturas, desenhoBytes: (d) => baixarDesenho(d?.caminho) });
  }
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${rel.codigo}.pdf"`,
    },
  });
}
