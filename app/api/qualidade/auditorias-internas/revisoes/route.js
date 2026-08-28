// HISTÓRICO DE REVISÕES do Cronograma de Auditoria — o que mudou de uma revisão para a outra.
// Cada envio para assinatura guarda um snapshot; comparando os snapshots em sequência sai a lista
// de inclusões/alterações/exclusões de auditoria. O bloco "pendentes" mostra o que já mudou no
// cronograma mas ainda não foi emitido (vai subir na próxima revisão, quando for para assinatura).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getRevisao } from "@/lib/assinatura-doc";
import { diffCronograma, resumoDiff, auditoriasDoSnapshot } from "@/lib/cronograma-auditoria-revisoes";

export const runtime = "nodejs";
const TIPO = "CRONOGRAMA_AUDITORIA";

export async function GET() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const envios = await prisma.envioAssinatura.findMany({
    where: { tipo: TIPO },
    orderBy: { enviadoEm: "asc" },
    select: {
      id: true, revisao: true, titulo: true, enviadoEm: true, enviadoPorId: true, snapshot: true,
      assinaturas: { select: { id: true, nome: true, setor: true, email: true, assinadoEm: true, ip: true }, orderBy: { nome: "asc" } },
    },
  });

  const ids = [...new Set(envios.map((e) => e.enviadoPorId).filter(Boolean))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nomePor = new Map(users.map((u) => [u.id, u.name]));

  const revisoes = envios.map((e, i) => {
    const atual = auditoriasDoSnapshot(e);
    const anterior = i > 0 ? auditoriasDoSnapshot(envios[i - 1]) : null;
    const diff = anterior ? diffCronograma(anterior, atual) : null;
    return {
      id: e.id, revisao: e.revisao, titulo: e.titulo, enviadoEm: e.enviadoEm,
      enviadoPor: nomePor.get(e.enviadoPorId) || null,
      nAuditorias: atual.length,
      inicial: i === 0,
      diff, resumo: diff ? resumoDiff(diff) : `emissão inicial · ${atual.length} auditoria(s)`,
      assinaturas: e.assinaturas,
    };
  }).reverse();

  const auditorias = await prisma.auditoriaInterna.findMany({
    orderBy: { dataAuditoria: "asc" },
    select: { numero: true, setor: true, dataAuditoria: true, responsavelAcompanhamento: true, status: true, escopo: true },
    take: 500,
  });
  const ultimo = envios[envios.length - 1];
  const diffPend = ultimo ? diffCronograma(auditoriasDoSnapshot(ultimo), auditorias) : null;

  return NextResponse.json({
    revisaoAtual: await getRevisao(TIPO),
    emitido: !!ultimo,
    nAuditorias: auditorias.length,
    pendentes: diffPend && diffPend.total ? { diff: diffPend, resumo: resumoDiff(diffPend), desdeRevisao: ultimo.revisao, desdeEm: ultimo.enviadoEm } : null,
    revisoes,
  });
}
