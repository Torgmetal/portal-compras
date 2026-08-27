// GET /api/rh/treinamentos/pdf — Plano Anual de Treinamentos em PDF (padrão Torg). ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getRevisao, fmtRev } from "@/lib/assinatura-doc";
import { gerarPlanoTreinamentoPDF } from "@/lib/plano-treinamento-pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req) {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  // ⚠⚠ O PADRÃO É O DOCUMENTO ASSINADO. Vitor (26/08/2026): "não está abrindo o pdf assinado, gera
  // um novo sem a assinatura".
  //
  // Esta rota lia os treinamentos de HOJE e chamava o gerador SEM `assinaturas` — saía uma folha
  // nova, sem assinatura nenhuma, exatamente quando a tela ao lado dizia "4/4 assinaram". Quem
  // guardava o documento de verdade era o link do assinante (/api/assinar/[token]/pdf), que usa o
  // SNAPSHOT do envio mais as assinaturas.
  //
  // Documento controlado não se regenera: ele é o retrato do que foi assinado. Se os treinamentos
  // mudaram depois, isso é uma REVISÃO nova — não uma folha diferente com o mesmo número.
  //
  // ⚠ `?atual=1` continua servindo o plano de hoje, sem assinaturas, para quem está preparando a
  // próxima revisão. Marcado como MINUTA no nome do arquivo, para ninguém confundir com o oficial.
  const atual = new URL(req.url).searchParams.get("atual") === "1";
  const envio = atual ? null : await prisma.envioAssinatura.findFirst({
    where: { tipo: "PLANO_TREINAMENTO" },
    orderBy: [{ revisao: "desc" }, { enviadoEm: "desc" }],
    include: { assinaturas: { select: { nome: true, setor: true, assinadoEm: true, ip: true }, orderBy: { nome: "asc" } } },
  }).catch(() => null);

  let ano, revisao, treinamentos, assinaturas = [], minuta = false;
  if (envio) {
    const snap = envio.snapshot || {};
    ano = snap.ano; revisao = snap.revisao ?? envio.revisao;
    treinamentos = snap.treinamentos || [];
    assinaturas = envio.assinaturas;
  } else {
    minuta = true;
    treinamentos = await prisma.treinamento.findMany({
      orderBy: { dataInicio: "asc" },
      select: { titulo: true, nrRelacionada: true, dataInicio: true, cargaHoraria: true, tipo: true },
    });
    revisao = await getRevisao("PLANO_TREINAMENTO");
    ano = treinamentos[0]?.dataInicio ? new Date(treinamentos[0].dataInicio).getUTCFullYear() : new Date().getUTCFullYear();
  }

  const bytes = await gerarPlanoTreinamentoPDF({ ano, revisao, treinamentos, assinaturas });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Plano de Treinamentos ${ano} ${fmtRev(revisao)}${minuta ? " (MINUTA)" : ""}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
