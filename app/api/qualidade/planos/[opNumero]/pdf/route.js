// GET /api/qualidade/planos/{opNumero}/pdf?doc=PIT|PLP — o plano em PDF, para conferir ANTES de enviar.
//
// Vitor (26/08/2026): "precisa permitir gerar um PDF antes de enviar para vermos a formatação".
//
// ⚠ SAI MARCADO COMO MINUTA enquanto não houver envio daquela revisão. Folha de conferência que sai
// igual à emitida acaba impressa, assinada à caneta e arquivada como se valesse.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { DOCS, montarPlano, tipoDoEnvio, comResponsaveis } from "@/lib/planos-aceite";
import { gerarPlanoClientePDF } from "@/lib/plano-cliente-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE", "COMERCIAL", "PRODUCAO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String((await params)?.opNumero || "").replace(/\D/g, "").padStart(3, "0");
  const doc = String(new URL(req.url).searchParams.get("doc") || "").toUpperCase();
  if (!DOCS[doc]) return NextResponse.json({ error: "Documento desconhecido (use PIT ou PLP)." }, { status: 400 });

  const plano = await montarPlano(prisma, doc, opNumero);
  if (plano.erro) return NextResponse.json({ error: plano.erro }, { status: 400 });

  // Já enviado nesta revisão? Então mostra o documento COMO FOI ENVIADO, com as assinaturas de
  // verdade — é o que a Qualidade quer ver quando volta para conferir o andamento.
  const envios = await prisma.envioAssinatura.findMany({
    where: { opNumero, revisao: plano.revisao, tipo: { in: [doc, tipoDoEnvio(doc, "INTERNA")] } },
    orderBy: { enviadoEm: "desc" },
    select: { id: true, tipo: true, snapshot: true },
  });
  const doCliente = envios.find((e) => e.tipo === doc) || null;
  const assinaturas = doCliente
    ? await prisma.assinaturaDocumento.findMany({
        where: { envioId: doCliente.id },
        select: { nome: true, setor: true, assinadoEm: true, ip: true },
        orderBy: { nome: "asc" },
      })
    : [];

  const bytes = await gerarPlanoClientePDF({
    snapshot: await comResponsaveis(prisma, doc, opNumero, doCliente?.snapshot || plano.snapshot),
    assinaturas,
    minuta: !envios.length,
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc}-T${opNumero}${envios.length ? "" : "-MINUTA"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
