// GET    /api/qualidade/auditorias/[id]  — detalhe (com documentos)
// PATCH  /api/qualidade/auditorias/[id]  — edita cabeçalho/solicitações/boas-vindas
// DELETE /api/qualidade/auditorias/[id]  — exclui (cascade nos documentos)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const a = await prisma.auditoria.findUnique({
    where: { id: params.id },
    include: { documentos: { orderBy: { createdAt: "asc" } } },
  });
  if (!a) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });
  return NextResponse.json({ success: true, data: a });
}

const BLOB_OK = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i;

const schema = z.object({
  empresa: z.string().min(2).max(160).optional(),
  contato: z.string().max(160).nullable().optional(),
  titulo: z.string().max(160).nullable().optional(),
  mensagemBoasVindas: z.string().max(2000).nullable().optional(),
  capaUrl: z.string().url().nullable().optional(),
  dataBookModeloUrl: z.string().url().nullable().optional(),
  checklistJson: z.any().optional(),
  itensAdicionais: z.array(z.object({ id: z.string().min(1).max(60), titulo: z.string().max(300), descricao: z.string().max(2000).nullable().optional() })).optional(),
  secoes: z.object({ estrutura: z.boolean(), maquinas: z.boolean(), equipe: z.boolean(), modelo: z.boolean() }).partial().optional(),
  solicitacoes: z.string().max(8000).nullable().optional(),
  // Relatório interno (constatações + plano de ação 5W2H + fotos + conclusão)
  dataAuditoria: z.string().nullable().optional(),
  auditor: z.string().max(200).nullable().optional(),
  norma: z.string().max(200).nullable().optional(),
  escopo: z.string().max(4000).nullable().optional(),
  conclusao: z.string().max(4000).nullable().optional(),
  constatacoes: z.array(z.object({ tipo: z.enum(["CONFORME", "NAO_CONFORME", "MELHORIA"]), descricao: z.string().max(2000) })).optional(),
  planoAcao: z.array(z.object({
    oque: z.string().max(1000), porque: z.string().max(1000).nullable().optional(), onde: z.string().max(300).nullable().optional(),
    quem: z.string().max(200).nullable().optional(), quando: z.string().nullable().optional(), como: z.string().max(1000).nullable().optional(),
    quanto: z.string().max(200).nullable().optional(), status: z.enum(["A_FAZER", "EM_ANDAMENTO", "CONCLUIDO"]).optional(),
    acompanhamento: z.string().max(2000).nullable().optional(), concluidoEm: z.string().nullable().optional(),
  })).optional(),
  fotos: z.array(z.object({ url: z.string().url(), legenda: z.string().max(300).nullable().optional() })).optional(),
  emitir: z.boolean().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  if (body.capaUrl && !BLOB_OK.test(body.capaUrl)) {
    return NextResponse.json({ success: false, error: "Imagem de capa inválida (origem não permitida)." }, { status: 400 });
  }
  if (body.dataBookModeloUrl && !BLOB_OK.test(body.dataBookModeloUrl)) {
    return NextResponse.json({ success: false, error: "Arquivo inválido (origem não permitida)." }, { status: 400 });
  }
  const data = {};
  for (const k of ["empresa", "contato", "titulo", "mensagemBoasVindas", "capaUrl", "dataBookModeloUrl", "solicitacoes"]) {
    if (body[k] !== undefined) data[k] = typeof body[k] === "string" ? (body[k].trim() || null) : body[k];
  }
  if (body.checklistJson !== undefined) data.checklistJson = body.checklistJson;
  if (body.itensAdicionais !== undefined) data.itensAdicionais = body.itensAdicionais.filter((i) => (i.titulo || "").trim()).map((i) => ({ id: i.id, titulo: i.titulo.trim(), descricao: (i.descricao || "").trim() || null }));
  // Abas visíveis pro auditor — merge em portalConfig.secoes (não mexe nos e-mails salvos).
  if (body.secoes) {
    const cfgRow = await prisma.auditoria.findUnique({ where: { id: params.id }, select: { portalConfig: true } });
    const cfg = cfgRow?.portalConfig && typeof cfgRow.portalConfig === "object" && !Array.isArray(cfgRow.portalConfig) ? cfgRow.portalConfig : {};
    data.portalConfig = { ...cfg, secoes: { ...(cfg.secoes || {}), ...body.secoes } };
  }

  // ── Relatório interno ──
  const dataDe = (s) => (s ? new Date(String(s).length <= 10 ? s + "T12:00:00Z" : s) : null);
  if (body.dataAuditoria !== undefined) data.dataAuditoria = dataDe(body.dataAuditoria);
  for (const k of ["auditor", "norma", "escopo", "conclusao"]) if (body[k] !== undefined) data[k] = (typeof body[k] === "string" ? body[k].trim() : "") || null;
  if (body.constatacoes !== undefined) data.constatacoes = body.constatacoes.filter((c) => (c.descricao || "").trim()).map((c) => ({ tipo: c.tipo, descricao: c.descricao.trim() }));
  if (body.planoAcao !== undefined) data.planoAcao = body.planoAcao.filter((p) => (p.oque || "").trim()).map((p) => ({
    oque: p.oque.trim(), porque: (p.porque || "").trim() || null, onde: (p.onde || "").trim() || null, quem: (p.quem || "").trim() || null,
    quando: p.quando || null, como: (p.como || "").trim() || null, quanto: (p.quanto || "").trim() || null, status: p.status || "A_FAZER",
    acompanhamento: (p.acompanhamento || "").trim() || null, concluidoEm: p.status === "CONCLUIDO" ? (p.concluidoEm || new Date().toISOString()) : null,
  }));
  if (body.fotos !== undefined) data.fotos = body.fotos.filter((f) => (f.url || "").trim()).map((f) => ({ url: f.url, legenda: (f.legenda || "").trim() || null }));
  if (body.emitir === true) data.relatorioEmitidoEm = new Date();

  // Número RAE na primeira vez que o relatório ganha conteúdo (ou é emitido).
  const temRelatorio = (data.constatacoes?.length || 0) > 0 || (data.planoAcao?.length || 0) > 0 || !!data.conclusao || !!data.escopo || body.emitir === true;
  if (temRelatorio) {
    const atual = await prisma.auditoria.findUnique({ where: { id: params.id }, select: { numero: true } });
    if (!atual?.numero) {
      const ult = await prisma.auditoria.findFirst({ where: { numero: { not: null } }, orderBy: { numero: "desc" }, select: { numero: true } });
      data.numero = (ult?.numero || 0) + 1;
    }
  }

  const a = await prisma.auditoria.update({ where: { id: params.id }, data, include: { documentos: { orderBy: { createdAt: "asc" } } } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "EDITAR_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: body } }).catch(() => {});
  return NextResponse.json({ success: true, data: a });
}

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  await prisma.auditoria.delete({ where: { id: params.id } }).catch(() => {});
  await prisma.auditLog.create({ data: { userId: user.id, action: "EXCLUIR_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true });
}
