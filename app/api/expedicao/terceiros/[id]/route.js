// GET    — detalhe de um romaneio terceirizado.
// PATCH  — edita cabeçalho / itens (recalcula peso e status).
// DELETE — remove o romaneio.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ALMOXARIFADO"];

const itemSchema = z.object({
  marca: z.string().min(1),
  descricao: z.string().optional().nullable(),
  qte: z.number().nullable().optional(),
  pesoUn: z.number().nullable().optional(),
  pesoTotal: z.number().nullable().optional(),
});
const schema = z.object({
  fornecedorId: z.string().nullable().optional(),
  terceiroNome: z.string().min(1).optional(),
  servico: z.string().max(200).nullable().optional(),
  opRefId: z.string().nullable().optional(),
  opRefNumero: z.string().nullable().optional(),
  transportadora: z.string().max(200).nullable().optional(),
  motorista: z.string().max(200).nullable().optional(),
  placaVeiculo: z.string().max(20).nullable().optional(),
  placaCarreta: z.string().max(20).nullable().optional(),
  contatoTransporte: z.string().max(200).nullable().optional(),
  itens: z.array(itemSchema).min(1).optional(),
  dataEnvio: z.string().nullable().optional(),
  dataPrevRetorno: z.string().nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
  status: z.enum(["ENVIADO", "PARCIAL", "RETORNADO", "CANCELADO"]).optional(),
});

function pesoDoItem(it) {
  if (it.pesoTotal != null) return Number(it.pesoTotal) || 0;
  if (it.qte != null && it.pesoUn != null) return (Number(it.qte) || 0) * (Number(it.pesoUn) || 0);
  return 0;
}
// status derivado do quanto já retornou (não mexe se CANCELADO)
function statusPorRetorno(pesoEnviado, pesoRetornado) {
  if (pesoRetornado <= 0) return "ENVIADO";
  if (pesoRetornado + 0.01 >= pesoEnviado) return "RETORNADO";
  return "PARCIAL";
}

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const rom = await prisma.romaneioTerceiro.findUnique({ where: { id: params.id } });
  if (!rom) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });
  return NextResponse.json({ success: true, romaneio: rom });
}

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const atual = await prisma.romaneioTerceiro.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  for (const k of ["fornecedorId", "opRefId"]) if (body[k] !== undefined) data[k] = body[k] || null;
  for (const k of ["terceiroNome", "servico", "opRefNumero", "transportadora", "motorista", "placaVeiculo", "placaCarreta", "contatoTransporte", "observacao"])
    if (body[k] !== undefined) data[k] = body[k]?.trim() || null;
  if (body.dataEnvio !== undefined) data.dataEnvio = body.dataEnvio ? new Date(body.dataEnvio) : null;
  if (body.dataPrevRetorno !== undefined) data.dataPrevRetorno = body.dataPrevRetorno ? new Date(body.dataPrevRetorno) : null;

  if (body.itens !== undefined) {
    const porMarca = new Map();
    for (const it of body.itens) {
      const k = it.marca.trim().toUpperCase();
      if (k && !porMarca.has(k)) porMarca.set(k, { marca: it.marca.trim(), descricao: it.descricao?.trim() || null, qte: it.qte ?? null, pesoUn: it.pesoUn ?? null, pesoTotal: pesoDoItem(it) });
    }
    const itens = [...porMarca.values()];
    if (!itens.length) return NextResponse.json({ error: "A carga precisa ter ao menos uma peça." }, { status: 400 });
    data.itens = itens;
    data.pesoEnviadoKg = itens.reduce((s, i) => s + (i.pesoTotal || 0), 0);
  }

  if (body.status !== undefined) {
    data.status = body.status; // permite CANCELAR/reabrir manualmente
  } else if (data.pesoEnviadoKg !== undefined && atual.status !== "CANCELADO") {
    data.status = statusPorRetorno(data.pesoEnviadoKg, atual.pesoRetornadoKg || 0);
  }

  const rom = await prisma.romaneioTerceiro.update({ where: { id: atual.id }, data });
  await prisma.auditLog.create({ data: { userId: user.id, action: "EDITAR_ROMANEIO_TERCEIRO", entity: "RomaneioTerceiro", entityId: rom.id, diff: { numero: rom.numero } } }).catch(() => {});
  return NextResponse.json({ success: true, romaneio: rom });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const atual = await prisma.romaneioTerceiro.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!atual) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });
  await prisma.romaneioTerceiro.delete({ where: { id: atual.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "EXCLUIR_ROMANEIO_TERCEIRO", entity: "RomaneioTerceiro", entityId: atual.id, diff: { numero: atual.numero } } }).catch(() => {});
  return NextResponse.json({ success: true });
}
