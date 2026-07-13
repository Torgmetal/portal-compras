// POST /api/admin/sincronizacoes/forcar  { job }
// Dispara um cron manualmente (re-invoca o endpoint com Bearer CRON_SECRET). O
// cron roda na própria invocação e atualiza o heartbeat. Só ADMIN.
// O client dispara sem bloquear a UI e acompanha pelo heartbeat.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { CRONS_ESPERADOS } from "@/lib/cron-monitor";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300; // alguns crons (Omie) passam de 1 min

const schema = z.object({ job: z.string().min(1) });

export async function POST(req) {
  let user;
  try {
    user = await requireAcesso({ tipos: ["ADMIN"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const cron = CRONS_ESPERADOS.find((c) => c.job === parsed.data.job);
  if (!cron) return NextResponse.json({ success: false, error: "Sincronização desconhecida" }, { status: 404 });

  const secret = process.env.CRON_SECRET;
  const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;

  // Os crons agora exigem o Bearer CRON_SECRET (o User-Agent deixou de valer —
  // SEC-01). Sem o segredo configurado, o disparo forçado não autentica.
  if (!secret) {
    return NextResponse.json({ success: false, error: "CRON_SECRET não configurado no ambiente — configure na Vercel para forçar sincronizações." }, { status: 503 });
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "FORCAR_SYNC", entity: "CronHeartbeat", entityId: cron.job, diff: { job: cron.job } },
  }).catch(() => {});

  // Re-invoca o cron (nova função serverless) com o Bearer CRON_SECRET. O
  // endpoint em si já é restrito a ADMIN. Aguardamos até o fim pra o heartbeat
  // atualizar; o client não bloqueia a tela.
  try {
    const r = await fetch(`${origin}${cron.path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const texto = await r.text().catch(() => "");
    let resultado; try { resultado = JSON.parse(texto); } catch { resultado = texto.slice(0, 200); }
    return NextResponse.json({ success: r.ok, job: cron.job, status: r.status, resultado });
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao disparar: " + (e?.message || "erro") }, { status: 502 });
  }
}
