// Detalhe/edição da avaliação de um certificado de calibração (id = documentoId).
// GET garante a avaliação (cria PENDENTE se ainda não existe). PATCH salva metadados,
// anexos (foto/relatório) e a conclusão Aprovado/Reprovado (só com os anexos).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criteriosPadrao, CRITERIO_ACEITACAO_PADRAO } from "@/lib/calibracao";
import { z } from "zod";

export const runtime = "nodejs";

async function garantirAvaliacao(documentoId) {
  let av = await prisma.avaliacaoCalibracao.findUnique({ where: { documentoId } });
  if (!av) {
    const ultima = await prisma.avaliacaoCalibracao.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
    av = await prisma.avaliacaoCalibracao.create({
      data: { numero: (ultima?.numero || 0) + 1, documentoId, criterios: criteriosPadrao(), criterioAceitacao: CRITERIO_ACEITACAO_PADRAO, conclusao: "PENDENTE" },
    });
  }
  return av;
}

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const doc = await prisma.documentoQualidade.findUnique({ where: { id: params.id } });
  if (!doc || doc.categoria !== "EQUIPAMENTOS") return NextResponse.json({ error: "Certificado de calibração não encontrado" }, { status: 404 });

  const av = await garantirAvaliacao(doc.id);
  let avaliadorNome = null;
  if (av.avaliadorId) { const u = await prisma.user.findUnique({ where: { id: av.avaliadorId }, select: { name: true, email: true } }); avaliadorNome = u?.name || u?.email || null; }

  return NextResponse.json({
    documento: { id: doc.id, nome: doc.nome, tipo: doc.tipo, norma: doc.norma, numeroDocumento: doc.numeroDocumento, dataEmissao: doc.dataEmissao, dataValidade: doc.dataValidade, arquivoUrl: doc.arquivoUrl, sharepointItemId: doc.sharepointItemId },
    avaliacao: { ...av, avaliadorNome },
  });
}

const anexo = z.object({ url: z.string().url(), nome: z.string().max(300).optional().nullable() }).optional().nullable();
const schema = z.object({
  documento: z.object({
    nome: z.string().min(1).max(300).optional(),
    norma: z.string().max(200).optional().nullable(),
    numeroDocumento: z.string().max(200).optional().nullable(),
    dataEmissao: z.string().optional().nullable(),
    dataValidade: z.string().optional().nullable(),
  }).optional(),
  identificacao: z.string().max(300).optional().nullable(),
  faixaUso: z.string().max(300).optional().nullable(),
  laboratorio: z.string().max(300).optional().nullable(),
  criterios: z.array(z.object({
    criterio: z.string().max(500),
    situacao: z.enum(["CONFORME", "NAO_CONFORME", "NA"]).optional(),
    observacao: z.string().max(500).optional().nullable(),
  })).optional(),
  criterioAceitacao: z.string().max(2000).optional().nullable(),
  parecer: z.string().max(3000).optional().nullable(),
  fotoEquipamento: anexo,
  relatorio: anexo,
  removerFoto: z.boolean().optional(),
  removerRelatorio: z.boolean().optional(),
  conclusao: z.enum(["PENDENTE", "APROVADO", "REPROVADO"]).optional(),
});

const dataDe = (s) => (s ? new Date(s + "T12:00:00Z") : null);

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const doc = await prisma.documentoQualidade.findUnique({ where: { id: params.id }, select: { id: true, categoria: true } });
  if (!doc || doc.categoria !== "EQUIPAMENTOS") return NextResponse.json({ error: "Certificado de calibração não encontrado" }, { status: 404 });
  const atual = await garantirAvaliacao(doc.id);

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // Metadados do certificado (documento)
  if (body.documento) {
    const d = {};
    if (body.documento.nome !== undefined) d.nome = body.documento.nome.trim();
    if (body.documento.norma !== undefined) d.norma = body.documento.norma?.trim() || null;
    if (body.documento.numeroDocumento !== undefined) d.numeroDocumento = body.documento.numeroDocumento?.trim() || null;
    if (body.documento.dataEmissao !== undefined) d.dataEmissao = dataDe(body.documento.dataEmissao);
    if (body.documento.dataValidade !== undefined) d.dataValidade = dataDe(body.documento.dataValidade);
    if (Object.keys(d).length) await prisma.documentoQualidade.update({ where: { id: doc.id }, data: d });
  }

  // Anexos finais (após remoção/substituição) — usados na trava de conclusão
  const fotoUrl = body.removerFoto ? null : (body.fotoEquipamento?.url ?? atual.fotoEquipamentoUrl);
  const relUrl = body.removerRelatorio ? null : (body.relatorio?.url ?? atual.relatorioUrl);

  const data = {};
  if (body.identificacao !== undefined) data.identificacao = body.identificacao?.trim() || null;
  if (body.faixaUso !== undefined) data.faixaUso = body.faixaUso?.trim() || null;
  if (body.laboratorio !== undefined) data.laboratorio = body.laboratorio?.trim() || null;
  if (body.criterios !== undefined) data.criterios = body.criterios.map((c) => ({ criterio: (c.criterio || "").trim(), situacao: c.situacao || "NA", observacao: (c.observacao || "").trim() || "" }));
  if (body.criterioAceitacao !== undefined) data.criterioAceitacao = body.criterioAceitacao?.trim() || null;
  if (body.parecer !== undefined) data.parecer = body.parecer?.trim() || null;
  if (body.removerFoto) { data.fotoEquipamentoUrl = null; data.fotoEquipamentoNome = null; }
  else if (body.fotoEquipamento?.url) { data.fotoEquipamentoUrl = body.fotoEquipamento.url; data.fotoEquipamentoNome = body.fotoEquipamento.nome || null; }
  if (body.removerRelatorio) { data.relatorioUrl = null; data.relatorioNome = null; }
  else if (body.relatorio?.url) { data.relatorioUrl = body.relatorio.url; data.relatorioNome = body.relatorio.nome || null; }

  if (body.conclusao !== undefined) {
    if ((body.conclusao === "APROVADO" || body.conclusao === "REPROVADO") && !(fotoUrl && relUrl)) {
      return NextResponse.json({ error: "Anexe a foto do equipamento e o relatório antes de aprovar/reprovar." }, { status: 400 });
    }
    data.conclusao = body.conclusao;
    if (body.conclusao === "PENDENTE") { data.avaliadoEm = null; data.avaliadorId = null; }
    else { data.avaliadoEm = new Date(); data.avaliadorId = user.id; }
  }

  const salvo = await prisma.avaliacaoCalibracao.update({ where: { id: atual.id }, data });
  if (body.conclusao === "APROVADO" || body.conclusao === "REPROVADO") {
    await prisma.auditLog.create({ data: { userId: user.id, action: "AVALIAR_CALIBRACAO", entity: "AvaliacaoCalibracao", entityId: doc.id, diff: { numero: salvo.numero, conclusao: body.conclusao } } }).catch(() => {});
  }
  return NextResponse.json({ success: true });
}
