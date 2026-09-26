// Regras de IBS/CBS aprendidas das NFs do Omie (lib/fiscal/coleta-ibs-cbs).
//   GET  ?ncm=&cfop=  → o que as nossas notas dizem para este NCM × CFOP (UNICA | DIVERGENTE | SEM_NF)
//   POST              → reconstrói tudo de 2026 a partir do Omie (botão "Atualizar regras das NFs")
import { NextResponse } from "next/server";
import { prisma, prismaDirect } from "@/lib/prisma";
import { requireAcesso, requireRole } from "@/lib/session";
import { regraIbsCbs, reconstruirRegras } from "@/lib/fiscal/coleta-ibs-cbs";
import { log } from "@/lib/log";

const registro = log("api/fiscal/regras-ibs-cbs");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ⚠ Reconstrução do ano: ~9 meses × páginas de 50 NF, com o backoff do Omie.
export const maxDuration = 300;

const negado = (e) => NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

export async function GET(req) {
  try { await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] }); } catch (e) { return negado(e); }
  const u = new URL(req.url);
  const r = await regraIbsCbs({ ncm: u.searchParams.get("ncm"), cfop: u.searchParams.get("cfop") }, prisma);
  return NextResponse.json({ success: true, ...r });
}

export async function POST() {
  let user;
  try { user = await requireRole(["ADMIN", "FISCAL"]); } catch (e) { return negado(e); }
  try {
    const r = await reconstruirRegras({ db: prismaDirect });
    await prisma.auditLog.create({ data: { userId: user.id, action: "RECONSTRUIR_REGRAS_IBS_CBS",
      entity: "FiscalRegraIbsCbs", entityId: "todas", diff: r } }).catch(() => {});
    registro.info(`regras IBS/CBS reconstruídas por ${user.email}: ${r.notas} NF(s), ${r.regras} regra(s)`);
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    registro.erro("reconstruir regras IBS/CBS:", e.message);
    return NextResponse.json({ success: false, error: e.message }, { status: 502 });
  }
}
