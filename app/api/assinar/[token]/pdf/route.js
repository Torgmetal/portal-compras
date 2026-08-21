// PDF PÚBLICO (token) do documento a assinar — gerado do SNAPSHOT (versão fixa enviada),
// já com o quadro de assinaturas eletrônicas atualizado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarPlanoTreinamentoPDF } from "@/lib/plano-treinamento-pdf";
import { gerarCronogramaAuditoriaPDF } from "@/lib/cronograma-auditoria-pdf";
import { gerarRelatorioInspecaoPDF } from "@/lib/relatorio-inspecao-pdf";
import { baixarDesenho } from "@/lib/relatorio-dimensional";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req, { params }) {
  const a = await prisma.assinaturaDocumento.findUnique({
    where: { token: params.token },
    select: { envioId: true, envio: { select: { tipo: true, titulo: true, snapshot: true } } },
  });
  if (!a) return new NextResponse("Link inválido.", { status: 404 });

  const snap = a.envio.snapshot || {};
  const assinaturas = await prisma.assinaturaDocumento.findMany({
    where: { envioId: a.envioId },
    select: { nome: true, setor: true, assinadoEm: true, ip: true },
    orderBy: { nome: "asc" },
  });

  let bytes;
  if (a.envio.tipo === "PLANO_TREINAMENTO") {
    bytes = await gerarPlanoTreinamentoPDF({ ano: snap.ano, revisao: snap.revisao, treinamentos: snap.treinamentos || [], assinaturas });
  } else if (a.envio.tipo === "CRONOGRAMA_AUDITORIA") {
    bytes = await gerarCronogramaAuditoriaPDF({ ano: snap.ano, revisao: snap.revisao, auditorias: snap.auditorias || [], assinaturas });
  } else if (a.envio.tipo === "RELATORIO_INSPECAO") {
    // ⚠ aqui o snapshot guarda só o ID: o corpo do relatório são FOTOS, e copiar dezenas de URLs
    // pro snapshot só criaria uma segunda cópia pra desencontrar. O documento é relido do banco.
    const rel = snap.relatorioId
      ? await prisma.relatorioInspecao.findUnique({ where: { id: snap.relatorioId } })
      : null;
    if (!rel) return new NextResponse("Relatório não encontrado.", { status: 404 });
    const fotos = await prisma.fotoInspecao.findMany({
      where: { relatorioId: rel.id },
      orderBy: { capturadaEm: "asc" },
      select: { url: true, marca: true, origemMarca: true, observacao: true, capturadaEm: true, autorNome: true },
    });
    bytes = await gerarRelatorioInspecaoPDF({ rel, fotos, assinaturas, desenhoBytes: (d) => baixarDesenho(d?.caminho) });
  } else {
    return new NextResponse("Documento não suportado.", { status: 400 });
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${a.envio.titulo}.pdf"`, "Cache-Control": "no-store" },
  });
}
