// POST /api/fornecedores/sync-omie[?dryRun=1] — puxa os fornecedores do Omie
// (tag "Fornecedor") para a Vendor List. dryRun só devolve os números, não grava.
// Só ADMIN/COMPRAS.
import { NextResponse } from "next/server";
import { prisma, prismaDirect } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { aquecerBanco } from "@/lib/db-retry";
import { sincronizarFornecedoresOmie } from "@/lib/omie-fornecedores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROLES = ["ADMIN", "COMPRAS"];

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    await aquecerBanco(prisma);
    if (!dryRun) await aquecerBanco(prismaDirect).catch(() => {});
    const r = await sincronizarFornecedoresOmie({ dryRun });
    if (!dryRun) {
      await prisma.auditLog.create({ data: { userId: user.id, action: "SYNC_FORNECEDORES_OMIE", entity: "Fornecedor", entityId: String(r.novos + r.vinculados), diff: r } }).catch(() => {});
    }
    return NextResponse.json({ success: true, dryRun, ...r });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 502 });
  }
}
