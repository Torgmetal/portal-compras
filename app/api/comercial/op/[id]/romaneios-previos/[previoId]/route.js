// PATCH — edita a carga: dados, ITENS (acrescentar/retirar peça), lote e
//         APROVAÇÃO. Aprovado = liberado para a Expedição; sem aprovar fica
//         "em aberto" (PREVISTO).
// DELETE — remove o romaneio prévio.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"];

const itemSchema = z.object({
  frente: z.string().optional().nullable(),
  marca: z.string().min(1),
  descricao: z.string().optional().nullable(),
  qte: z.number().nullable().optional(),
  pesoTotal: z.number().nullable().optional(),
});
const schema = z.object({
  dataPrevista: z.string().nullable().optional(),
  local: z.string().max(300).nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
  loteId: z.string().nullable().optional(),
  itens: z.array(itemSchema).optional(),
  aprovado: z.boolean().optional(), // true = libera pra Expedição; false = volta a ficar em aberto
  status: z.enum(["PREVISTO", "APROVADO", "CANCELADO"]).optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const atual = await prisma.romaneioPrevio.findFirst({ where: { id: params.previoId, opId: params.id }, select: { id: true, status: true } });
  if (!atual) return NextResponse.json({ error: "Romaneio prévio não encontrado" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.dataPrevista !== undefined) data.dataPrevista = body.dataPrevista ? new Date(body.dataPrevista) : null;
  if (body.local !== undefined) data.local = body.local?.trim() || null;
  if (body.observacao !== undefined) data.observacao = body.observacao?.trim() || null;
  if (body.loteId !== undefined) {
    data.loteId = body.loteId
      ? (await prisma.loteExpedicao.findFirst({ where: { id: body.loteId, opId: params.id }, select: { id: true } }))?.id ?? null
      : null;
  }
  if (body.itens !== undefined) {
    // dedupe por marca; peso recalculado a partir dos itens que ficaram
    const porMarca = new Map();
    for (const it of body.itens) {
      const k = it.marca.trim().toUpperCase();
      if (k && !porMarca.has(k)) porMarca.set(k, { frente: it.frente || null, marca: it.marca.trim(), descricao: it.descricao || null, qte: it.qte ?? null, pesoTotal: it.pesoTotal ?? 0 });
    }
    const itens = [...porMarca.values()];
    if (!itens.length) return NextResponse.json({ error: "A carga precisa ter ao menos uma peça." }, { status: 400 });
    data.itens = itens;
    data.pesoKg = itens.reduce((s, i) => s + (i.pesoTotal || 0), 0);
  }
  if (body.status !== undefined) data.status = body.status;
  if (body.aprovado !== undefined) {
    data.status = body.aprovado ? "APROVADO" : "PREVISTO";
    data.aprovadoEm = body.aprovado ? new Date() : null;
    data.aprovadoPorId = body.aprovado ? user.id : null;
  }

  const previo = await prisma.romaneioPrevio.update({ where: { id: atual.id }, data });
  if (body.aprovado !== undefined) {
    await prisma.auditLog.create({ data: { userId: user.id, action: body.aprovado ? "APROVAR_ROMANEIO_PREVIO" : "REABRIR_ROMANEIO_PREVIO", entity: "OP", entityId: params.id, diff: { numero: previo.numero, pesoKg: previo.pesoKg } } }).catch(() => {});
  }
  return NextResponse.json({ success: true, previo });
}

export async function DELETE(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.romaneioPrevio.deleteMany({ where: { id: params.previoId, opId: params.id } });
  return NextResponse.json({ success: true });
}
