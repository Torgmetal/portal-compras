// POST   — registra um RETORNO (parcial ou total) do material que estava no terceiro.
//          Escolhe as marcas/qtd que voltaram; recalcula peso retornado e status.
// DELETE  ?retornoId=  — desfaz um retorno lançado (correção).
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ALMOXARIFADO"];

const schema = z.object({
  data: z.string().nullable().optional(),
  itens: z.array(z.object({
    marca: z.string().min(1),
    qte: z.number().nullable().optional(),
    pesoTotal: z.number().nullable().optional(),
  })).min(1, "Selecione ao menos uma peça que voltou."),
  observacao: z.string().max(1000).nullable().optional(),
});

function statusPorRetorno(pesoEnviado, pesoRetornado) {
  if (pesoRetornado <= 0) return "ENVIADO";
  if (pesoRetornado + 0.01 >= pesoEnviado) return "RETORNADO";
  return "PARCIAL";
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const rom = await prisma.romaneioTerceiro.findUnique({ where: { id: params.id } });
  if (!rom) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const itens = body.itens.map((it) => ({ marca: it.marca.trim(), qte: it.qte ?? null, pesoTotal: Number(it.pesoTotal) || 0 }));
  const pesoKg = itens.reduce((s, i) => s + (i.pesoTotal || 0), 0);
  const retorno = {
    id: randomUUID(),
    data: body.data ? new Date(body.data).toISOString() : new Date().toISOString(),
    itens, pesoKg,
    observacao: body.observacao?.trim() || null,
    porNome: user.name || null,
  };

  const retornos = [...(Array.isArray(rom.retornos) ? rom.retornos : []), retorno];
  const pesoRetornadoKg = retornos.reduce((s, r) => s + (Number(r.pesoKg) || 0), 0);
  const status = rom.status === "CANCELADO" ? "CANCELADO" : statusPorRetorno(rom.pesoEnviadoKg || 0, pesoRetornadoKg);

  const atualizado = await prisma.romaneioTerceiro.update({ where: { id: rom.id }, data: { retornos, pesoRetornadoKg, status } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "RETORNO_ROMANEIO_TERCEIRO", entity: "RomaneioTerceiro", entityId: rom.id, diff: { numero: rom.numero, pesoKg, pesoRetornadoKg, status } } }).catch(() => {});
  return NextResponse.json({ success: true, romaneio: atualizado });
}

export async function DELETE(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const retornoId = new URL(req.url).searchParams.get("retornoId");
  if (!retornoId) return NextResponse.json({ error: "retornoId obrigatório" }, { status: 400 });
  const rom = await prisma.romaneioTerceiro.findUnique({ where: { id: params.id } });
  if (!rom) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });

  const retornos = (Array.isArray(rom.retornos) ? rom.retornos : []).filter((r) => r.id !== retornoId);
  const pesoRetornadoKg = retornos.reduce((s, r) => s + (Number(r.pesoKg) || 0), 0);
  const status = rom.status === "CANCELADO" ? "CANCELADO" : statusPorRetorno(rom.pesoEnviadoKg || 0, pesoRetornadoKg);

  const atualizado = await prisma.romaneioTerceiro.update({ where: { id: rom.id }, data: { retornos, pesoRetornadoKg, status } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DESFAZER_RETORNO_TERCEIRO", entity: "RomaneioTerceiro", entityId: rom.id, diff: { numero: rom.numero, retornoId } } }).catch(() => {});
  return NextResponse.json({ success: true, romaneio: atualizado });
}
