// Detalhe / edição de uma auditoria interna. PATCH salva tanto os dados da
// identificação quanto o relatório (constatações, ações, conclusão).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { acoesPendentes } from "@/lib/auditoria-interna";
import { bumpRevisao } from "@/lib/assinatura-doc";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const a = await prisma.auditoriaInterna.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });
  return NextResponse.json({ auditoria: a });
}

const schema = z.object({
  setor: z.string().min(1).max(120).optional(),
  dataAuditoria: z.string().optional().nullable(),
  responsavelAcompanhamento: z.string().min(1).max(120).optional(),
  auditor: z.string().max(120).optional().nullable(),
  norma: z.string().max(120).optional().nullable(),
  escopo: z.string().max(2000).optional().nullable(),
  conclusao: z.string().max(4000).optional().nullable(),
  constatacoes: z.array(z.object({
    tipo: z.enum(["CONFORME", "NAO_CONFORME", "MELHORIA"]),
    descricao: z.string().max(2000),
  })).optional(),
  acoes: z.array(z.object({
    oque: z.string().max(1000),
    responsavel: z.string().max(120).optional().nullable(),
    prazo: z.string().optional().nullable(),
    resposta: z.string().max(3000).optional().nullable(),
    evidencias: z.array(z.object({ url: z.string().url(), legenda: z.string().max(300).optional().nullable() })).optional(),
    concluida: z.boolean().optional(),
    respondidoEm: z.string().optional().nullable(),
  })).optional(),
  fotos: z.array(z.object({
    url: z.string().url(),
    legenda: z.string().max(300).optional().nullable(),
  })).optional(),
  finalizar: z.boolean().optional(),  // encerra o relatório (todas as ações concluídas)
  reabrir: z.boolean().optional(),    // volta de FINALIZADO para EMITIDO
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const atual = await prisma.auditoriaInterna.findUnique({ where: { id: params.id }, select: { id: true, status: true, acoes: true } });
  if (!atual) return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const agora = new Date();
  const data = {};
  if (body.setor !== undefined) data.setor = body.setor.trim();
  if (body.dataAuditoria !== undefined) data.dataAuditoria = body.dataAuditoria ? new Date(body.dataAuditoria + "T12:00:00Z") : undefined;
  if (body.responsavelAcompanhamento !== undefined) data.responsavelAcompanhamento = body.responsavelAcompanhamento.trim();
  if (body.auditor !== undefined) data.auditor = body.auditor?.trim() || null;
  if (body.norma !== undefined) data.norma = body.norma?.trim() || null;
  if (body.escopo !== undefined) data.escopo = body.escopo?.trim() || null;
  if (body.conclusao !== undefined) data.conclusao = body.conclusao?.trim() || null;
  if (body.constatacoes !== undefined) data.constatacoes = body.constatacoes.filter((c) => (c.descricao || "").trim()).map((c) => ({ tipo: c.tipo, descricao: c.descricao.trim() }));
  if (body.acoes !== undefined) data.acoes = body.acoes.filter((a) => (a.oque || "").trim()).map((a) => {
    const concluida = !!a.concluida;
    const evidencias = Array.isArray(a.evidencias) ? a.evidencias.filter((e) => (e?.url || "").trim()).map((e) => ({ url: e.url, legenda: (e.legenda || "").trim() || null })) : [];
    return {
      oque: a.oque.trim(),
      responsavel: (a.responsavel || "").trim() || null,
      prazo: a.prazo || null,
      resposta: (a.resposta || "").trim() || null,
      evidencias,
      concluida,
      respondidoEm: concluida ? (a.respondidoEm || agora.toISOString()) : null,
    };
  });
  if (body.fotos !== undefined) data.fotos = body.fotos.filter((f) => (f.url || "").trim()).map((f) => ({ url: f.url, legenda: (f.legenda || "").trim() || null }));

  // Enquanto não emitido, ganhar conteúdo de relatório marca como "em elaboração".
  const temRelatorio = (data.constatacoes?.length || 0) > 0 || !!data.conclusao || (data.acoes?.length || 0) > 0 || (data.fotos?.length || 0) > 0;
  if (atual.status === "AGENDADA" && temRelatorio) data.status = "REALIZADA";

  // Encerrar / reabrir o relatório. Encerra só se emitido e sem ação pendente.
  if (body.finalizar) {
    if (atual.status !== "EMITIDO") return NextResponse.json({ error: "Só é possível finalizar um relatório já emitido (divulgado ao setor)." }, { status: 400 });
    const acoesFinais = data.acoes !== undefined ? data.acoes : atual.acoes;
    const pend = acoesPendentes(acoesFinais).length;
    if (pend) return NextResponse.json({ error: `Ainda há ${pend} ação(ões) em aberto no plano. Conclua todas antes de finalizar.` }, { status: 400 });
    data.status = "FINALIZADO";
    data.finalizadoEm = agora;
  } else if (body.reabrir) {
    if (atual.status !== "FINALIZADO") return NextResponse.json({ error: "O relatório não está finalizado." }, { status: 400 });
    data.status = "EMITIDO";
    data.finalizadoEm = null;
  }

  await prisma.auditoriaInterna.update({ where: { id: atual.id }, data });
  // Mudou algo do CRONOGRAMA (setor/data/responsável) → sobe a revisão do documento.
  if (data.setor !== undefined || data.dataAuditoria !== undefined || data.responsavelAcompanhamento !== undefined) {
    await bumpRevisao("CRONOGRAMA_AUDITORIA").catch(() => {});
  }
  if (body.finalizar || body.reabrir) {
    await prisma.auditLog.create({ data: { userId: user.id, action: body.finalizar ? "FINALIZAR_AUDITORIA_INTERNA" : "REABRIR_AUDITORIA_INTERNA", entity: "AuditoriaInterna", entityId: atual.id, diff: {} } }).catch(() => {});
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.auditoriaInterna.delete({ where: { id: params.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "EXCLUIR_AUDITORIA_INTERNA", entity: "AuditoriaInterna", entityId: params.id, diff: {} } }).catch(() => {});
  await bumpRevisao("CRONOGRAMA_AUDITORIA").catch(() => {});
  return NextResponse.json({ success: true });
}
