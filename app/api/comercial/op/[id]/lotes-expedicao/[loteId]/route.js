// PATCH / DELETE de um lote de entrega da OP.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { renomearArea } from "@/lib/cronograma-areas";
import { normArea } from "@/lib/cronograma-area-cor";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];

const schema = z.object({
  nome: z.string().min(1).max(200).optional(),
  local: z.string().max(300).nullable().optional(),
  dataPrevista: z.string().nullable().optional(),
  pesoKg: z.number().nonnegative().nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
  ordem: z.number().int().optional(),
  status: z.enum(["PENDENTE", "ENTREGUE"]).optional(),
  transportadora: z.string().max(200).nullable().optional(),
  motorista: z.string().max(200).nullable().optional(),
  placaVeiculo: z.string().max(20).nullable().optional(),
  placaCarreta: z.string().max(20).nullable().optional(),
  contatoTransporte: z.string().max(100).nullable().optional(),
});

export async function PATCH(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const lote = await prisma.loteExpedicao.findFirst({ where: { id: params.loteId, opId: params.id }, select: { id: true, nome: true } });
  if (!lote) return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.nome !== undefined) data.nome = body.nome.trim();
  if (body.local !== undefined) data.local = body.local?.trim() || null;
  if (body.dataPrevista !== undefined) data.dataPrevista = body.dataPrevista ? new Date(body.dataPrevista) : null;
  if (body.pesoKg !== undefined) data.pesoKg = body.pesoKg;
  if (body.observacao !== undefined) data.observacao = body.observacao?.trim() || null;
  if (body.ordem !== undefined) data.ordem = body.ordem;
  if (body.status !== undefined) data.status = body.status;
  for (const k of ["transportadora", "motorista", "placaVeiculo", "placaCarreta", "contatoTransporte"]) {
    if (body[k] !== undefined) data[k] = body[k]?.trim() || null;
  }

  const atualizado = await prisma.loteExpedicao.update({ where: { id: lote.id }, data });

  /* ⚠⚠ RENOMEAR A FASE TEM DE CHEGAR NO CRONOGRAMA. As fases (lotes de entrega) viram as ÁREAS do
     cronograma — Vitor: "precisamos ter isso ligado". Só que renomear aqui não mexia lá, e as duas
     pontas se separavam por uma letra: a OP-105 ficou com o lote "Quadros Vasadores" e a área
     "Quadro Vasadores", e a área órfã parou de receber datas e avanço (aparecendo como atraso que
     não existe). O vínculo é o NOME, então ele tem de andar junto.
     ⚠ Só propaga se existir área com o nome ANTIGO. Se alguém já renomeou a área dentro do
     cronograma de propósito, ela não casa mais com o lote — e aí mandar renomear criaria uma área
     nova, duplicando. Nesse caso não se toca em nada. */
  const nomeAntigo = lote.nome;
  if (data.nome && normArea(data.nome) !== normArea(nomeAntigo)) {
    const cronos = await prisma.cronograma.findMany({ where: { opId: params.id }, select: { id: true, areas: true } });
    for (const c of cronos) {
      const areas = Array.isArray(c.areas) ? c.areas : [];
      if (!areas.some((a) => normArea(a?.nome) === normArea(nomeAntigo))) continue;
      await renomearArea(prisma, c.id, nomeAntigo, data.nome);
    }
  }

  await prisma.auditLog.create({
    data: { action: "LOTE_ATUALIZAR", entity: "LoteExpedicao", entityId: lote.id,
            diff: { antes: { nome: nomeAntigo }, depois: data } },
  }).catch(() => {});

  return NextResponse.json({ success: true, lote: atualizado });
}

export async function DELETE(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.loteExpedicao.deleteMany({ where: { id: params.loteId, opId: params.id } });
  return NextResponse.json({ success: true });
}
