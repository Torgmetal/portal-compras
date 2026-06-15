// GET  /api/qualidade/documentos  — lista + stats (status calculado)
// POST /api/qualidade/documentos  — cria documento (+ backup ISO no SharePoint)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";
import { calcStatusValidade, diasAlertaCategoria } from "@/lib/qualidade-status";
import { backupISODocumentoQualidade } from "@/lib/qualidade-doc-backup";

export const runtime = "nodejs";

const CATEGORIAS = ["MATERIAL", "EQUIPAMENTOS", "FUNCIONARIOS", "SISTEMA", "TERCEIROS"];

const schema = z.object({
  nome: z.string().min(2, "Nome muito curto"),
  categoria: z.enum(CATEGORIAS),
  tipo: z.string().nullable().optional(),
  norma: z.string().nullable().optional(),
  vinculo: z.string().nullable().optional(),
  opNumero: z.string().nullable().optional(),
  numeroCorrida: z.string().nullable().optional(),
  numeroDocumento: z.string().nullable().optional(),
  dataEmissao: z.string().nullable().optional(),
  dataValidade: z.string().nullable().optional(),
  responsavel: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  arquivoUrl: z.string().nullable().optional(),
  arquivoNome: z.string().nullable().optional(),
  arquivoTamanho: z.number().int().nullable().optional(),
  arquivoTipo: z.string().nullable().optional(),
});

const naoVazio = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const categoria = searchParams.get("categoria");
  const escopo = searchParams.get("escopo"); // "material" (rastreabilidade) | "empresa" (docs da empresa)
  const statusFiltro = searchParams.get("status"); // VIGENTE|VENCENDO|VENCIDO|SEM_VALIDADE
  const validadoFiltro = searchParams.get("validado"); // true|false (default todos)
  const opFiltro = searchParams.get("op"); // filtra por opNumero (rastreabilidade)
  const busca = (searchParams.get("busca") || "").trim().toLowerCase();

  const where = { ativo: true };
  // Escopo separa rastreabilidade (MATERIAL) dos documentos da empresa (demais categorias).
  if (categoria && CATEGORIAS.includes(categoria)) where.categoria = categoria;
  else if (escopo === "material") where.categoria = "MATERIAL";
  else if (escopo === "empresa") where.categoria = { not: "MATERIAL" };
  if (validadoFiltro === "true") where.validado = true;
  if (validadoFiltro === "false") where.validado = false;

  const docs = await prisma.documentoQualidade.findMany({
    where,
    orderBy: [{ dataValidade: "asc" }, { createdAt: "desc" }],
  });

  // status calculado + filtros que dependem dele
  let lista = docs.map((d) => {
    const st = calcStatusValidade(d.dataValidade, diasAlertaCategoria(d.categoria));
    return {
      id: d.id,
      nome: d.nome,
      categoria: d.categoria,
      tipo: d.tipo,
      norma: d.norma,
      vinculo: d.vinculo,
      opNumero: d.opNumero,
      numeroCorrida: d.numeroCorrida,
      numeroDocumento: d.numeroDocumento,
      importRef: d.importRef,
      fornecedor: d.fornecedor,
      dataEmissao: d.dataEmissao,
      dataValidade: d.dataValidade,
      responsavel: d.responsavel,
      observacao: d.observacao,
      origem: d.origem,
      validado: d.validado,
      validadoEm: d.validadoEm,
      temArquivo: !!(d.arquivoUrl || d.sharepointItemId),
      sharepointUrl: d.sharepointUrl,
      createdAt: d.createdAt,
      status: st.key,
      statusLabel: st.label,
      diasParaVencer: st.dias,
    };
  });

  // OPs distintas para o seletor — calculadas ANTES dos filtros de busca/OP
  const ops = [...new Set(lista.map((d) => d.opNumero).filter(Boolean))].sort();

  if (busca) {
    lista = lista.filter((d) =>
      [d.nome, d.tipo, d.norma, d.vinculo, d.opNumero, d.numeroCorrida, d.numeroDocumento, d.importRef, d.fornecedor, d.responsavel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(busca))
    );
  }
  if (opFiltro) lista = lista.filter((d) => d.opNumero === opFiltro);

  const stats = {
    total: lista.length,
    vencidos: lista.filter((d) => d.status === "VENCIDO").length,
    vencendo: lista.filter((d) => d.status === "VENCENDO").length,
    vigentes: lista.filter((d) => d.status === "VIGENTE").length,
    semValidade: lista.filter((d) => d.status === "SEM_VALIDADE").length,
    naoValidados: lista.filter((d) => !d.validado).length,
  };

  if (statusFiltro) lista = lista.filter((d) => d.status === statusFiltro);

  return NextResponse.json({ success: true, data: lista, stats, ops });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  if (body.arquivoUrl && !isBlobUrlSegura(body.arquivoUrl)) {
    return NextResponse.json({ success: false, error: "URL de arquivo inválida" }, { status: 400 });
  }

  const doc = await prisma.documentoQualidade.create({
    data: {
      nome: body.nome.trim(),
      categoria: body.categoria,
      tipo: naoVazio(body.tipo),
      norma: naoVazio(body.norma),
      vinculo: naoVazio(body.vinculo),
      opNumero: naoVazio(body.opNumero),
      numeroCorrida: naoVazio(body.numeroCorrida),
      numeroDocumento: naoVazio(body.numeroDocumento),
      dataEmissao: body.dataEmissao ? new Date(body.dataEmissao) : null,
      dataValidade: body.dataValidade ? new Date(body.dataValidade) : null,
      responsavel: naoVazio(body.responsavel),
      observacao: naoVazio(body.observacao),
      origem: "registro_manual",
      arquivoUrl: body.arquivoUrl || null,
      arquivoNome: naoVazio(body.arquivoNome),
      arquivoTamanho: body.arquivoTamanho ?? null,
      arquivoTipo: naoVazio(body.arquivoTipo),
      createdById: user.id,
    },
  });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "CRIAR_DOC_QUALIDADE", entity: "DocumentoQualidade", entityId: doc.id, diff: { nome: doc.nome, categoria: doc.categoria } } })
    .catch(() => {});

  let backup = { ok: false };
  if (doc.arquivoUrl) backup = await backupISODocumentoQualidade(doc, user.id);

  return NextResponse.json({ success: true, id: doc.id, backup }, { status: 201 });
}
