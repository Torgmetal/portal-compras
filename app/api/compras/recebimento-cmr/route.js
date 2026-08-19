// CONCILIAÇÃO DO RECEBIMENTO COM O CMR — marca no Portal de Compras o material que o
// Almoxarifado já lançou no CMR mas que ainda aparecia como "aguardando entrega".
//
// POST { opNumeros?: string[], simular?: boolean }
//   simular: true (padrão) devolve o que FARIA, sem gravar. Use antes de aplicar.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { conciliarRecebimentoCmr } from "@/lib/recebimento-cmr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROLES = ["ADMIN", "COMPRAS", "PCP", "PLANEJAMENTO"];

const schema = z.object({
  opNumeros: z.array(z.string()).optional(),
  simular: z.boolean().default(true),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json().catch(() => ({}))); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  try {
    const r = await conciliarRecebimentoCmr({ opNumeros: body.opNumeros || null, simular: body.simular, userId: user.id });
    if (!body.simular && r.resumo.itens) {
      await prisma.auditLog.create({
        data: {
          userId: user.id, action: "CONCILIAR_RECEBIMENTO_CMR", entity: "Recebimento", entityId: String(r.resumo.itens),
          diff: { itens: r.resumo.itens, kg: r.resumo.kg, fechados: r.resumo.fechados, ops: r.resumo.ops, opNumeros: body.opNumeros || "todas" },
        },
      }).catch(() => {});
    }
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
