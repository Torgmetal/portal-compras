// Avaliação de certificados de calibração (Qualidade / PO-20).
// GET lista os certificados (DocumentoQualidade categoria EQUIPAMENTOS) com a avaliação.
// POST cadastra um novo certificado (equipamento) + cria a avaliação PENDENTE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criteriosPadrao, CRITERIO_ACEITACAO_PADRAO, temAnexos } from "@/lib/calibracao";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const docs = await prisma.documentoQualidade.findMany({
    where: { categoria: "EQUIPAMENTOS", ativo: true },
    orderBy: [{ dataEmissao: "desc" }, { nome: "asc" }],
    select: {
      id: true, nome: true, tipo: true, norma: true, numeroDocumento: true,
      dataEmissao: true, dataValidade: true, arquivoUrl: true, sharepointItemId: true,
      avaliacaoCalibracao: { select: { numero: true, conclusao: true, fotoEquipamentoUrl: true, relatorioUrl: true, avaliadoEm: true } },
    },
    take: 500,
  });

  const lista = docs.map((d) => {
    const av = d.avaliacaoCalibracao;
    return {
      id: d.id, nome: d.nome, tipo: d.tipo, norma: d.norma, numeroDocumento: d.numeroDocumento,
      dataEmissao: d.dataEmissao, dataValidade: d.dataValidade,
      temCertificado: !!(d.arquivoUrl || d.sharepointItemId),
      numero: av?.numero ?? null,
      conclusao: av?.conclusao ?? "PENDENTE",
      temFoto: !!av?.fotoEquipamentoUrl,
      temRelatorio: !!av?.relatorioUrl,
      podeAvaliar: temAnexos(av),
      avaliadoEm: av?.avaliadoEm ?? null,
    };
  });
  return NextResponse.json({ itens: lista });
}

const anexo = z.object({ url: z.string().url(), nome: z.string().max(300).optional().nullable() }).optional().nullable();
const schema = z.object({
  nome: z.string().min(1, "Informe o equipamento.").max(300),
  tipo: z.string().max(120).optional().nullable(),
  identificacao: z.string().max(300).optional().nullable(),
  faixaUso: z.string().max(300).optional().nullable(),
  laboratorio: z.string().max(300).optional().nullable(),
  norma: z.string().max(200).optional().nullable(),
  numeroDocumento: z.string().max(200).optional().nullable(),
  dataEmissao: z.string().optional().nullable(),
  dataValidade: z.string().optional().nullable(),
  certificado: z.object({
    url: z.string().url(), nome: z.string().max(300).optional().nullable(),
    tamanho: z.number().optional().nullable(), tipo: z.string().max(120).optional().nullable(),
  }).optional().nullable(),
  fotoEquipamento: anexo,
  relatorio: anexo,
});

const dataDe = (s) => (s ? new Date(s + "T12:00:00Z") : null);

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const ultima = await prisma.avaliacaoCalibracao.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
  const numero = (ultima?.numero || 0) + 1;

  const doc = await prisma.documentoQualidade.create({
    data: {
      nome: body.nome.trim(),
      categoria: "EQUIPAMENTOS",
      tipo: (body.tipo || "Calibração").trim(),
      norma: body.norma?.trim() || null,
      numeroDocumento: body.numeroDocumento?.trim() || null,
      dataEmissao: dataDe(body.dataEmissao),
      dataValidade: dataDe(body.dataValidade),
      origem: "registro_manual",
      arquivoUrl: body.certificado?.url || null,
      arquivoNome: body.certificado?.nome || null,
      arquivoTamanho: body.certificado?.tamanho || null,
      arquivoTipo: body.certificado?.tipo || null,
      createdById: user.id,
    },
    select: { id: true },
  });

  await prisma.avaliacaoCalibracao.create({
    data: {
      numero, documentoId: doc.id,
      identificacao: body.identificacao?.trim() || null,
      faixaUso: body.faixaUso?.trim() || null,
      laboratorio: body.laboratorio?.trim() || null,
      fotoEquipamentoUrl: body.fotoEquipamento?.url || null,
      fotoEquipamentoNome: body.fotoEquipamento?.nome || null,
      relatorioUrl: body.relatorio?.url || null,
      relatorioNome: body.relatorio?.nome || null,
      criterios: criteriosPadrao(),
      criterioAceitacao: CRITERIO_ACEITACAO_PADRAO,
      conclusao: "PENDENTE",
      createdById: user.id,
    },
  });

  await prisma.auditLog.create({ data: { userId: user.id, action: "CRIAR_CALIBRACAO", entity: "AvaliacaoCalibracao", entityId: doc.id, diff: { numero, nome: body.nome } } }).catch(() => {});
  return NextResponse.json({ success: true, id: doc.id, numero });
}
