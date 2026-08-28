import "server-only";
import { prisma } from "@/lib/prisma";

// Revisão dos documentos assináveis (Plano de Treinamentos, Cronograma de Auditoria Interna).
// R00 = estado inicial. QUANDO sobe depende do documento:
//  · Plano de Treinamentos → quando o conteúdo muda (Vitor 09/08).
//  · Cronograma de Auditoria → SÓ ao enviar para assinatura, e só se mudou desde o último envio
//    (Vitor 27/08: "somente subir revisão no caso de enviar para assinatura"). Editar o cronograma
//    durante o mês é rascunho; o que virou revisão fica em /qualidade/auditorias-internas/revisoes.
export const fmtRev = (n) => `R${String(n ?? 0).padStart(2, "0")}`;

export async function getRevisao(tipo) {
  try { const r = await prisma.documentoRevisao.findUnique({ where: { tipo } }); return r?.revisao ?? 0; }
  catch { return 0; }
}

export async function bumpRevisao(tipo) {
  const r = await prisma.documentoRevisao.upsert({
    where: { tipo },
    update: { revisao: { increment: 1 } },
    create: { tipo, revisao: 1 },
  });
  return r.revisao;
}
