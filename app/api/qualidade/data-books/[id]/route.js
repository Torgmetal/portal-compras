// GET   /api/qualidade/data-books/[id]  — detalhe (seções + docs vinculados + travas)
// PATCH /api/qualidade/data-books/[id]  — edita cabeçalho / emite (com trava)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcStatusValidade, diasAlertaCategoria } from "@/lib/qualidade-status";
import { secaoUsaModulo1 } from "@/lib/databook-secoes";

export const runtime = "nodejs";

const schema = z.object({
  observacao: z.string().nullable().optional(),
  pesoTotalKg: z.number().nullable().optional(),
  pecas: z.number().int().nullable().optional(),
  status: z.enum(["EM_MONTAGEM", "EMITIDO"]).optional(),
});

function resolverDoc(d) {
  const st = calcStatusValidade(d.dataValidade, diasAlertaCategoria(d.categoria));
  return {
    id: d.id, nome: d.nome, tipo: d.tipo, norma: d.norma, categoria: d.categoria,
    importRef: d.importRef, numeroDocumento: d.numeroDocumento,
    numeroCorrida: d.numeroCorrida, dataValidade: d.dataValidade, validado: d.validado,
    temArquivo: !!(d.arquivoUrl || d.sharepointItemId),
    status: st.key, statusLabel: st.label,
  };
}

async function montarDetalhe(id) {
  const book = await prisma.dataBookQualidade.findUnique({
    where: { id },
    include: {
      secoes: { orderBy: { ordem: "asc" }, include: { documentos: true } },
      aprovacoes: { orderBy: { aprovadoEm: "asc" } },
    },
  });
  if (!book) return null;

  // resolve todos os documentos vinculados + candidatos da OP
  const idsVinculados = [...new Set(book.secoes.flatMap((s) => s.documentos.map((d) => d.documentoId)))];
  const candidatos = await prisma.documentoQualidade.findMany({
    where: { ativo: true, opNumero: book.opNumero },
    orderBy: { createdAt: "desc" },
  });
  const docsById = new Map(candidatos.map((d) => [d.id, d]));
  // garante que docs vinculados que não estão entre os candidatos (ex.: opNumero mudou) também resolvam
  const faltantes = idsVinculados.filter((x) => !docsById.has(x));
  if (faltantes.length) {
    const extra = await prisma.documentoQualidade.findMany({ where: { id: { in: faltantes } } });
    extra.forEach((d) => docsById.set(d.id, d));
  }

  const secoes = book.secoes.map((s) => {
    const docs = s.documentos.map((ld) => docsById.get(ld.documentoId)).filter(Boolean).map(resolverDoc);
    const temVencido = docs.some((d) => d.status === "VENCIDO");
    const usaM1 = secaoUsaModulo1(s.fonte);
    return {
      id: s.id, numero: s.numero, titulo: s.titulo, norma: s.norma, fonte: s.fonte,
      estado: s.estado, observacao: s.observacao, usaModulo1: usaM1,
      conteudoJson: s.conteudoJson || null,
      documentos: docs, temVencido,
      bloqueada: s.estado === "ANEXADO" && temVencido, // anexada mas com doc vencido
    };
  });

  const candidatosResolvidos = candidatos.map(resolverDoc);
  const naoNA = secoes.filter((s) => s.estado !== "NA");
  const pendentes = naoNA.filter((s) => s.estado !== "ANEXADO");
  const bloqueadas = secoes.filter((s) => s.bloqueada);
  const podeEmitir = pendentes.length === 0 && bloqueadas.length === 0;
  const anexadas = secoes.filter((s) => s.estado === "ANEXADO").length;

  return {
    id: book.id, opNumero: book.opNumero, cliente: book.cliente, obra: book.obra,
    pesoTotalKg: book.pesoTotalKg, pecas: book.pecas, observacao: book.observacao, tipo: book.tipo,
    status: book.status, emitidoEm: book.emitidoEm, createdAt: book.createdAt,
    aprovacoes: book.aprovacoes.map((a) => ({ id: a.id, userId: a.userId, nome: a.nome, papel: a.papel, aprovadoEm: a.aprovadoEm })),
    clienteEmail: book.clienteEmail, enviadoClienteEm: book.enviadoClienteEm,
    aceiteEm: book.aceiteEm, aceiteNome: book.aceiteNome, tokenCliente: book.tokenCliente,
    secoes, candidatos: candidatosResolvidos,
    resumo: {
      total: secoes.length, anexadas, na: secoes.filter((s) => s.estado === "NA").length,
      obrigatorias: naoNA.length, pendentes: pendentes.length, bloqueadas: bloqueadas.length,
      progresso: naoNA.length > 0 ? Math.round((anexadas / naoNA.length) * 100) : 0,
      podeEmitir,
    },
  };
}

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const detalhe = await montarDetalhe(params.id);
  if (!detalhe) return NextResponse.json({ success: false, error: "Data book não encontrado" }, { status: 404 });
  return NextResponse.json({ success: true, data: detalhe });
}

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

  const atual = await prisma.dataBookQualidade.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ success: false, error: "Data book não encontrado" }, { status: 404 });

  // Emissão exige todas as seções obrigatórias prontas (trava de emissão §8)
  if (body.status === "EMITIDO" && atual.status !== "EMITIDO") {
    const det = await montarDetalhe(params.id);
    if (!det.resumo.podeEmitir) {
      return NextResponse.json(
        { success: false, error: `Não é possível emitir: ${det.resumo.pendentes} seção(ões) pendente(s) e ${det.resumo.bloqueadas} com documento vencido.` },
        { status: 400 }
      );
    }
  }

  const data = {};
  if (body.observacao !== undefined) data.observacao = body.observacao?.trim() || null;
  if (body.pesoTotalKg !== undefined) data.pesoTotalKg = body.pesoTotalKg;
  if (body.pecas !== undefined) data.pecas = body.pecas;
  if (body.status !== undefined) {
    data.status = body.status;
    data.emitidoEm = body.status === "EMITIDO" ? new Date() : null;
  }

  await prisma.dataBookQualidade.update({ where: { id: params.id }, data });
  await prisma.auditLog
    .create({ data: { userId: user.id, action: "EDITAR_DATABOOK_QUALIDADE", entity: "DataBookQualidade", entityId: params.id, diff: body } })
    .catch(() => {});

  const detalhe = await montarDetalhe(params.id);
  return NextResponse.json({ success: true, data: detalhe });
}
