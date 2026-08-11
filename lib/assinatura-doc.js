import "server-only";
import { prisma } from "@/lib/prisma";

// Revisão dos documentos assináveis (Plano de Treinamentos, Cronograma de Auditoria Interna).
// Sobe automático quando o conteúdo muda (Vitor 09/08). R00 = estado inicial.
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
