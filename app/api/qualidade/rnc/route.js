// RNC — Relatório de Não Conformidade (FORM 20). GET lista (filtra por tipo);
// POST cria (numeração sequencial por ano, compartilhada entre interna e cliente).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const tipo = new URL(req.url).searchParams.get("tipo");
  const where = tipo === "INTERNA" || tipo === "CLIENTE" ? { tipo } : {};
  const rncs = await prisma.naoConformidade.findMany({
    where, orderBy: [{ ano: "desc" }, { numero: "desc" }], take: 400,
    select: {
      id: true, numero: true, ano: true, tipo: true, data: true, cliente: true, opNumero: true,
      processoArea: true, descricao: true, status: true, prazoResposta: true, encerradaEm: true,
      pertinente: true, recorrente: true, numeroCliente: true,
    },
  });
  return NextResponse.json({ rncs });
}

const schema = z.object({
  tipo: z.enum(["INTERNA"]).default("INTERNA"),
  data: z.string().optional().nullable(),
  cliente: z.string().max(200).optional().nullable(),
  opNumero: z.string().max(60).optional().nullable(),
  opId: z.string().optional().nullable(),
  desenhoProjetoMarca: z.string().max(500).optional().nullable(),
  origem: z.string().max(40).optional().nullable(),
  fornecedor: z.string().max(200).optional().nullable(),
  processoArea: z.string().max(120).optional().nullable(),
  descricao: z.string().max(6000).optional().nullable(),
  prazoResposta: z.string().optional().nullable(),
  numeroCliente: z.string().max(80).optional().nullable(),
  programa: z.string().max(120).optional().nullable(),
  jobCliente: z.string().max(120).optional().nullable(),
  anexoUrl: z.string().url().optional().nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const dt = body.data ? new Date(body.data + "T12:00:00Z") : new Date();
  const ano = dt.getUTCFullYear();
  const ultima = await prisma.naoConformidade.findFirst({ where: { ano }, orderBy: { numero: "desc" }, select: { numero: true } });
  const numero = (ultima?.numero || 0) + 1;

  const rnc = await prisma.naoConformidade.create({
    data: {
      numero, ano, tipo: body.tipo, data: dt,
      cliente: body.cliente?.trim() || null, opNumero: body.opNumero?.trim() || null, opId: body.opId || null,
      desenhoProjetoMarca: body.desenhoProjetoMarca?.trim() || null,
      origem: body.origem || null,
      fornecedor: body.fornecedor?.trim() || null, processoArea: body.processoArea?.trim() || null,
      descricao: body.descricao?.trim() || null, prazoResposta: body.prazoResposta ? new Date(body.prazoResposta + "T12:00:00Z") : null,
      numeroCliente: body.numeroCliente?.trim() || null, programa: body.programa?.trim() || null,
      jobCliente: body.jobCliente?.trim() || null, anexoUrl: body.anexoUrl || null,
      createdById: user.id,
    },
    select: { id: true, numero: true, ano: true },
  });
  return NextResponse.json({ success: true, id: rnc.id, numero: rnc.numero, ano: rnc.ano });
}
