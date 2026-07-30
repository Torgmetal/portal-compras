// PATCH — registra a NF de um romaneio emitido (aba Fiscal).
// Finalizado = número + tipo preenchidos (seta nfEmitidaEm/registradoPor).
// Reabrir (limpar número ou tipo) volta pra "aguardando".
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "FISCAL", "FINANCEIRO"];

const schema = z.object({
  nfNumero: z.string().max(60).nullable().optional(),
  nfTipo: z.enum(["VENDA", "SERVICO", "REMESSA"]).nullable().optional(),
  nfObservacao: z.string().max(1000).nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const previo = await prisma.romaneioPrevio.findUnique({
    where: { id: params.id },
    select: { id: true, emitidoEm: true, nfNumero: true, nfTipo: true, nfEmitidaEm: true },
  });
  if (!previo) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });
  if (!previo.emitidoEm) return NextResponse.json({ error: "Romaneio ainda não foi emitido." }, { status: 400 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.nfNumero !== undefined) data.nfNumero = body.nfNumero?.trim() || null;
  if (body.nfTipo !== undefined) data.nfTipo = body.nfTipo || null;
  if (body.nfObservacao !== undefined) data.nfObservacao = body.nfObservacao?.trim() || null;

  // Estado resultante após o merge: finalizado só com número E tipo.
  const numeroFinal = "nfNumero" in data ? data.nfNumero : previo.nfNumero;
  const tipoFinal = "nfTipo" in data ? data.nfTipo : previo.nfTipo;
  const completo = !!(numeroFinal && tipoFinal);
  if (completo && !previo.nfEmitidaEm) { data.nfEmitidaEm = new Date(); data.nfRegistradoPorId = user.id; }
  if (!completo && previo.nfEmitidaEm) { data.nfEmitidaEm = null; data.nfRegistradoPorId = null; }

  const atualizado = await prisma.romaneioPrevio.update({ where: { id: previo.id }, data });
  await prisma.auditLog.create({ data: { userId: user.id, action: completo ? "FISCAL_NF_REGISTRADA" : "FISCAL_NF_EDITADA", entity: "RomaneioPrevio", entityId: previo.id, diff: { nfNumero: numeroFinal, nfTipo: tipoFinal } } }).catch(() => {});

  return NextResponse.json({ success: true, romaneio: { ...atualizado, finalizado: completo } });
}
