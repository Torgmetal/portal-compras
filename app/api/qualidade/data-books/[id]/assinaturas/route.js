// GET  /api/qualidade/data-books/[id]/assinaturas — estado da cadeia de assinaturas
// POST /api/qualidade/data-books/[id]/assinaturas — inicia/configura a cadeia e dispara
//   o e-mail da 1ª etapa (Elaborador). Ordem: Elaborador → Inspetor → RT → Cliente.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { RT_NOME, fmtOPdb, baseUrlDe, enviarEmailEtapa } from "@/lib/databook-assinaturas";

export const runtime = "nodejs";

const pub = (a) => ({ id: a.id, ordem: a.ordem, papel: a.papel, nome: a.nome, email: a.email, status: a.status, enviadoEm: a.enviadoEm, assinadoEm: a.assinadoEm, assinadoNome: a.assinadoNome });

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const assinaturas = await prisma.dataBookAssinatura.findMany({ where: { dataBookId: params.id }, orderBy: { ordem: "asc" } });
  return NextResponse.json({ success: true, assinaturas: assinaturas.map(pub) });
}

const schema = z.object({
  elaboradorNome: z.string().max(120).optional().nullable(),
  elaboradorEmail: z.string().email("E-mail do elaborador inválido").toLowerCase(),
  inspetorNome: z.string().max(120).optional().nullable(),
  inspetorEmail: z.string().email("E-mail do inspetor inválido").toLowerCase(),
  rtEmail: z.string().email("E-mail do responsável técnico inválido").toLowerCase(),
  clienteNome: z.string().max(120).optional().nullable(),
  clienteEmail: z.string().email("E-mail do cliente inválido").toLowerCase(),
});

export async function POST(req, { params }) {
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

  const book = await prisma.dataBookQualidade.findUnique({ where: { id: params.id }, include: { assinaturas: true } });
  if (!book) return NextResponse.json({ success: false, error: "Data book não encontrado" }, { status: 404 });
  if (book.assinaturas.some((a) => a.status === "ASSINADO")) {
    return NextResponse.json({ success: false, error: "O fluxo de assinaturas já está em andamento (já há assinatura registrada). Não é possível reconfigurar." }, { status: 400 });
  }

  const op = fmtOPdb(book.opNumero);
  const etapas = [
    { ordem: 1, papel: "ELABORADOR", nome: body.elaboradorNome?.trim() || null, email: body.elaboradorEmail },
    { ordem: 2, papel: "INSPETOR", nome: body.inspetorNome?.trim() || null, email: body.inspetorEmail },
    { ordem: 3, papel: "RESP_TECNICO", nome: RT_NOME, email: body.rtEmail },
    { ordem: 4, papel: "CLIENTE", nome: body.clienteNome?.trim() || book.cliente || null, email: body.clienteEmail },
  ];

  // Recria a cadeia do zero (nenhuma etapa assinada ainda)
  await prisma.dataBookAssinatura.deleteMany({ where: { dataBookId: params.id } });
  for (const e of etapas) {
    await prisma.dataBookAssinatura.create({ data: { dataBookId: params.id, ordem: e.ordem, papel: e.papel, nome: e.nome, email: e.email, token: gerarTokenForte(32), status: "PENDENTE" } });
  }

  // Dispara a 1ª etapa (Elaborador)
  const primeira = await prisma.dataBookAssinatura.findUnique({ where: { dataBookId_ordem: { dataBookId: params.id, ordem: 1 } } });
  const link = `${baseUrlDe(req)}/data-book/assinar/${primeira.token}`;
  let enviado = true;
  try {
    await enviarEmailEtapa({ email: primeira.email, papel: primeira.papel, nomeDest: primeira.nome, op, obra: book.obra, link });
  } catch { enviado = false; }
  await prisma.dataBookAssinatura.update({ where: { id: primeira.id }, data: { status: "ENVIADO", enviadoEm: new Date() } });
  await prisma.dataBookQualidade.update({ where: { id: params.id }, data: { status: book.status === "ACEITO" ? "ACEITO" : "EM_ASSINATURA" } });

  await prisma.auditLog.create({ data: { userId: user.id, action: "INICIAR_ASSINATURAS_DATABOOK", entity: "DataBookQualidade", entityId: params.id, diff: { etapas: etapas.map((e) => ({ papel: e.papel, email: e.email })), enviado } } }).catch(() => {});

  const assinaturas = await prisma.dataBookAssinatura.findMany({ where: { dataBookId: params.id }, orderBy: { ordem: "asc" } });
  return NextResponse.json({ success: true, enviado, assinaturas: assinaturas.map(pub) });
}

// PATCH { ordem } — reenvia o e-mail da etapa (só a etapa "da vez": anteriores assinadas
// e ela ainda não assinada).
export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  let ordem;
  try {
    ordem = z.object({ ordem: z.number().int().min(1).max(4) }).parse(await req.json()).ordem;
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  const book = await prisma.dataBookQualidade.findUnique({ where: { id: params.id }, select: { opNumero: true, obra: true } });
  const etapas = await prisma.dataBookAssinatura.findMany({ where: { dataBookId: params.id }, orderBy: { ordem: "asc" } });
  const etapa = etapas.find((e) => e.ordem === ordem);
  if (!book || !etapa) return NextResponse.json({ success: false, error: "Etapa não encontrada" }, { status: 404 });
  if (etapa.status === "ASSINADO") return NextResponse.json({ success: false, error: "Etapa já assinada." }, { status: 400 });
  if (!etapas.filter((e) => e.ordem < ordem).every((e) => e.status === "ASSINADO")) {
    return NextResponse.json({ success: false, error: "Ainda não é a vez desta etapa (etapa anterior pendente)." }, { status: 400 });
  }
  const link = `${baseUrlDe(req)}/data-book/assinar/${etapa.token}`;
  let enviado = true;
  try { await enviarEmailEtapa({ email: etapa.email, papel: etapa.papel, nomeDest: etapa.nome, op: fmtOPdb(book.opNumero), obra: book.obra, link }); } catch { enviado = false; }
  await prisma.dataBookAssinatura.update({ where: { id: etapa.id }, data: { status: "ENVIADO", enviadoEm: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "REENVIAR_ASSINATURA_DATABOOK", entity: "DataBookAssinatura", entityId: etapa.id, diff: { ordem, enviado } } }).catch(() => {});
  return NextResponse.json({ success: true, enviado });
}
