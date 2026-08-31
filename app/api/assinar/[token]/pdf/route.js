// PDF PÚBLICO (token) do documento a assinar — gerado do SNAPSHOT (versão fixa enviada),
// já com o quadro de assinaturas eletrônicas atualizado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarPlanoTreinamentoPDF } from "@/lib/plano-treinamento-pdf";
import { gerarCronogramaAuditoriaPDF } from "@/lib/cronograma-auditoria-pdf";
import { baixarDesenho } from "@/lib/relatorio-dimensional";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";
import { gerarPlanoClientePDF } from "@/lib/plano-cliente-pdf";
import { comResponsaveis, docDoTipo } from "@/lib/planos-aceite";
import { dispArquivo } from "@/lib/arquivo-http";

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
    select: { nome: true, setor: true, assinadoEm: true, ip: true, imagemUrl: true },
    orderBy: { nome: "asc" },
  });

  let bytes;
  if (a.envio.tipo === "PLANO_TREINAMENTO") {
    bytes = await gerarPlanoTreinamentoPDF({ ano: snap.ano, revisao: snap.revisao, treinamentos: snap.treinamentos || [], assinaturas });
  } else if (a.envio.tipo === "CRONOGRAMA_AUDITORIA") {
    bytes = await gerarCronogramaAuditoriaPDF({ ano: snap.ano, revisao: snap.revisao, auditorias: snap.auditorias || [], assinaturas });
  } else if (["PLP", "PIT", "PLP_INTERNO", "PIT_INTERNO"].includes(a.envio.tipo)) {
    // ⚠ O PLANO É LIDO NA TELA ANTES DO ACEITE. O entregável continua sendo o Excel (anexo do
    // e-mail e botão nesta mesma página); este PDF existe para o inspetor do cliente ver o que
    // está aceitando sem precisar baixar e abrir uma planilha.
    bytes = await gerarPlanoClientePDF({
      snapshot: await comResponsaveis(prisma, docDoTipo(a.envio.tipo), a.envio.opNumero, snap),
      assinaturas,
    });
  } else if (a.envio.tipo === "GRD_PCP") {
    // ⚠ A GUIA JÁ NASCE COMPLETA NO SNAPSHOT. Diferente do relatório de inspeção, aqui não relemos
    // o banco: a guia é o registro do que foi entregue NAQUELE dia, com o R que estava carimbado no
    // papel. Se o CMR mudar depois, a guia continua provando a entrega — que é a única coisa que
    // uma guia de remessa precisa provar.
    const { gerarGuiaPcpPDF } = await import("@/lib/grd-pcp-pdf");
    ({ bytes } = await gerarGuiaPcpPDF({ ...snap, assinaturas }));
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
    // ⚠ o MESMO despacho da tela interna (lib/relatorio-render.js). Antes esta rota mandava
    // tudo que não fosse dimensional para o gerador antigo, e quem assinava recebia uma folha
    // que não é o documento.
    const op = await prisma.oP.findFirst({
      where: { numero: rel.opNumero }, select: { cliente: true, obra: true, refCliente: true },
    });
    bytes = await gerarPDFdoRelatorio({
      rel, fotos, assinaturas,
      cliente: op?.cliente || null, obra: op?.obra || null, refCliente: op?.refCliente || null,
      desenhoBytes: (d) => baixarDesenho(d?.caminho || d?.url),
    });
  } else {
    return new NextResponse("Documento não suportado.", { status: 400 });
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": dispArquivo(`${a.envio.titulo}.pdf`, "inline"), "Cache-Control": "no-store" },
  });
}
