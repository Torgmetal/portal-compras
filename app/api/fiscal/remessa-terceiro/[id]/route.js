// PATCH — registra/edita a NF de remessa de um romaneio a terceiro (aba Fiscal).
//   acao: "registrar" (nº/série/chave/CFOP → EMITIDA) | "dispensar" | "reabrir".
// Emissão integrada com Omie = Fase 2 (não emite nada aqui ainda; é bookkeeping).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "FISCAL", "FINANCEIRO"];

const schema = z.object({
  acao: z.enum(["registrar", "dispensar", "reabrir"]),
  cfop: z.string().max(10).nullable().optional(),
  natureza: z.string().max(120).nullable().optional(),
  nfNumero: z.string().max(60).nullable().optional(),
  nfSerie: z.string().max(20).nullable().optional(),
  nfChave: z.string().max(60).nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const atual = await prisma.romaneioTerceiro.findUnique({ where: { id: params.id }, select: { id: true, numero: true, remessaStatus: true } });
  if (!atual) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.acao === "registrar") {
    if (!body.nfNumero?.trim()) return NextResponse.json({ error: "Informe o número da NF." }, { status: 400 });
    data.remessaStatus = "EMITIDA";
    data.remessaNfNumero = body.nfNumero.trim();
    data.remessaNfSerie = body.nfSerie?.trim() || null;
    data.remessaNfChave = body.nfChave?.trim() || null;
    data.remessaCfop = body.cfop?.trim() || null;
    data.remessaNatureza = body.natureza?.trim() || null;
    data.remessaObservacao = body.observacao?.trim() || null;
    data.remessaNfEmitidaEm = new Date();
    data.remessaPorNome = user.name || null;
  } else if (body.acao === "dispensar") {
    data.remessaStatus = "DISPENSADA";
    data.remessaObservacao = body.observacao?.trim() || null;
    data.remessaPorNome = user.name || null;
  } else if (body.acao === "reabrir") {
    data.remessaStatus = "PENDENTE";
    data.remessaNfNumero = null; data.remessaNfSerie = null; data.remessaNfChave = null; data.remessaNfEmitidaEm = null;
  }

  const rom = await prisma.romaneioTerceiro.update({ where: { id: atual.id }, data });
  await prisma.auditLog.create({ data: { userId: user.id, action: "REMESSA_TERCEIRO_" + body.acao.toUpperCase(), entity: "RomaneioTerceiro", entityId: rom.id, diff: { numero: rom.numero, remessaStatus: rom.remessaStatus, nf: rom.remessaNfNumero } } }).catch(() => {});
  return NextResponse.json({ success: true, remessaStatus: rom.remessaStatus });
}
