// PDF PÚBLICO (token) do documento a assinar — gerado do SNAPSHOT (versão fixa enviada),
// já com o quadro de assinaturas eletrônicas atualizado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarPlanoTreinamentoPDF } from "@/lib/plano-treinamento-pdf";

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
  } else {
    return new NextResponse("Documento não suportado.", { status: 400 });
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${a.envio.titulo}.pdf"`, "Cache-Control": "no-store" },
  });
}
