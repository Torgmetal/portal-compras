// POST /api/comercial/orcamento-servico/[id]/revisao  { motivo }
// Sobe uma revisão da proposta: incrementa o número, grava data (auto) e o
// motivo (obrigatório) no histórico. Só depois de a proposta ter sido enviada
// ao cliente — correções antes do 1º envio não precisam de revisão.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ motivo: z.string().trim().min(3, "Descreva o que foi revisado").max(500) });

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const o = await prisma.orcamentoServico.findUnique({ where: { id: params.id } });
  if (!o) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });
  if (!o.enviadoEm) return NextResponse.json({ success: false, error: "Só é possível revisar depois de enviar a proposta ao cliente." }, { status: 400 });

  const novaRev = (o.revisao || 0) + 1;
  const revisoes = [...(Array.isArray(o.revisoes) ? o.revisoes : []), { num: novaRev, data: new Date().toISOString(), motivo: parsed.data.motivo }];
  const os = await prisma.orcamentoServico.update({ where: { id: o.id }, data: { revisao: novaRev, revisoes } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "REVISAR_PROPOSTA_SERVICO", entity: "OrcamentoServico", entityId: o.id, diff: { revisao: novaRev, motivo: parsed.data.motivo } },
  }).catch(() => {});

  return NextResponse.json({ success: true, revisao: novaRev, orcamento: os });
}
