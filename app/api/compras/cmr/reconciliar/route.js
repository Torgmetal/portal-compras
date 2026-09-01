// Reconciliação CMR planilha (SharePoint) ↔ portal — botão manual da tela.
//   POST { ano } → usa a MESMA lib do cron (lib/cmr-reconciliar) pra nunca divergir.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { reconciliarCmr } from "@/lib/cmr-reconciliar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

const schema = z.object({ ano: z.number().int().optional() });

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json().catch(() => ({}))); } catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const ano = body.ano || new Date().getFullYear();
  try {
    const r = await reconciliarCmr(prisma, ano, { userId: user.id });
    await prisma.auditLog.create({ data: { userId: user.id, action: "CMR_RECONCILIAR", entity: "DocumentoQualidade", entityId: String(r.importados + r.completados + r.enviados), diff: r } }).catch(() => {});
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 502 });
  }
}
