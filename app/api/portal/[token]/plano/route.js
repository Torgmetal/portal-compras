// GET /api/portal/{token}/plano?doc=PIT|PLP — o plano de controle da obra, para o cliente ler.
//
// ⚠ SAI DO ENVIO, não do cadastro. O que o cliente vê no portal tem de ser o documento que ele
// recebeu para aceitar — se o PLP mudar de cor depois, quem abrir aqui continua vendo o que
// aceitou. Plano nunca enviado não aparece no portal (não há o que mostrar ao cliente).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { secoesDoPortal, portalExpirado } from "@/lib/portal-cliente";
import { gerarPlanoClientePDF } from "@/lib/plano-cliente-pdf";
import { comResponsaveis } from "@/lib/planos-aceite";
import { registrarAcesso } from "@/lib/portal-acesso";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  const { token } = await params;
  const doc = String(new URL(req.url).searchParams.get("doc") || "").toUpperCase();
  if (doc !== "PIT" && doc !== "PLP") return new NextResponse("Documento inválido.", { status: 400 });

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO" || portalExpirado(portal)) return new NextResponse("Link inválido.", { status: 404 });
  if (!secoesDoPortal(portal).includes("PLANOS")) {
    return new NextResponse("Este documento não faz parte do portal desta obra.", { status: 403 });
  }

  const envio = await prisma.envioAssinatura.findFirst({
    where: { tipo: doc, opNumero: portal.opNumero },
    orderBy: { enviadoEm: "desc" },
    select: { id: true, snapshot: true, titulo: true },
  });
  if (!envio) return new NextResponse("Plano ainda não emitido para esta obra.", { status: 404 });

  const assinaturas = await prisma.assinaturaDocumento.findMany({
    where: { envioId: envio.id },
    select: { nome: true, setor: true, assinadoEm: true, ip: true },
    orderBy: { nome: "asc" },
  });

  const bytes = await gerarPlanoClientePDF({ snapshot: await comResponsaveis(prisma, doc, portal.opNumero, envio.snapshot), assinaturas });
  await registrarAcesso(req, {
    portal, codigo: new URL(req.url).searchParams.get("d"), evento: "DOWNLOAD",
    documento: envio.titulo, secao: "QUALIDADE",
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(`${doc}-T${portal.opNumero}.pdf`, "inline"),
      "Cache-Control": "no-store",
    },
  });
}
