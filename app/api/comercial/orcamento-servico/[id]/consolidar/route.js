// POST /api/comercial/orcamento-servico/[id]/consolidar  { consolidar: true|false }
// Consolida a proposta (marca consolidadaEm) — ganha a tarja "PROPOSTA
// CONSOLIDADA" e fica pronta pra enviar ao cliente para aceite. Só ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ consolidar: z.boolean().optional().default(true) });

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { consolidar } = schema.parse(body || {});

  const o = await prisma.orcamentoServico.findUnique({ where: { id: params.id }, select: { id: true, consolidadaEm: true, aceitoEm: true } });
  if (!o) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });
  if (o.aceitoEm) return NextResponse.json({ success: false, error: "Proposta já aceita pelo cliente — não é possível alterar a consolidação." }, { status: 409 });

  const os = await prisma.orcamentoServico.update({
    where: { id: o.id },
    data: { consolidadaEm: consolidar ? (o.consolidadaEm || new Date()) : null },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: consolidar ? "CONSOLIDAR_PROPOSTA_SERVICO" : "DESCONSOLIDAR_PROPOSTA_SERVICO", entity: "OrcamentoServico", entityId: o.id, diff: {} },
  }).catch(() => {});

  return NextResponse.json({ success: true, orcamento: os });
}
