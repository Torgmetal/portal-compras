// Cron Vercel — alerta de documentos da Qualidade vencidos / a vencer.
// Roda segunda de manhã (vercel.json). Manda e-mail pro endereço FIXO da Qualidade
// (env QUALIDADE_ALERTA_EMAILS, separado por vírgula). Não envia se não houver nada.
// Autenticação igual aos outros crons (user-agent vercel-cron OU Bearer CRON_SECRET).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { calcStatusValidade, diasAlertaCategoria } from "@/lib/qualidade-status";
import { requireRole } from "@/lib/session";
import { montarEmailVencidos } from "@/lib/qualidade-alerta-email";

export const runtime = "nodejs";
export const maxDuration = 60;

// Destinatários fixos da Qualidade: cadastrados no banco (EmailNotificacao, evento
// QUALIDADE_VENCIDOS — geríveis em /compras/notificacoes) + opcional env
// QUALIDADE_ALERTA_EMAILS. Deduplicado.
async function destinatarios() {
  const env = (process.env.QUALIDADE_ALERTA_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  let db = [];
  try {
    const insc = await prisma.emailNotificacao.findMany({ where: { ativo: true, eventos: { has: "QUALIDADE_VENCIDOS" } }, select: { email: true } });
    db = insc.map((i) => i.email).filter(Boolean);
  } catch { /* sem inscritos no banco não é fatal */ }
  return [...new Set([...db, ...env])];
}

export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  const ua = req.headers.get("user-agent") || "";
  const isCron = ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`;

  // Disparo manual: ADMIN logado → envia uma PRÉVIA só pro próprio e-mail (teste,
  // sem spammar os destinatários). Senão, só o cron interno do Vercel roda.
  let admin = null;
  if (!isCron) {
    try {
      admin = await requireRole(["ADMIN"]);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
    }
  }

  const to = admin ? [admin.email].filter(Boolean) : await destinatarios();
  if (!to.length) {
    if (!admin) console.warn("[cron qualidade-vencidos] nenhum destinatário cadastrado — pulando");
    return NextResponse.json({ ok: !admin, skipped: true, motivo: admin ? "seu usuário não tem e-mail cadastrado" : "sem destinatários (cadastre em /compras/notificacoes — evento QUALIDADE_VENCIDOS — ou env QUALIDADE_ALERTA_EMAILS)" });
  }

  const docs = await prisma.documentoQualidade.findMany({
    where: { ativo: true, dataValidade: { not: null } },
    select: { nome: true, tipo: true, categoria: true, dataValidade: true },
  });
  const vencidos = [], vencendo = [];
  for (const d of docs) {
    d._st = calcStatusValidade(d.dataValidade, diasAlertaCategoria(d.categoria));
    if (d._st.key === "VENCIDO") vencidos.push(d);
    else if (d._st.key === "VENCENDO") vencendo.push(d);
  }
  if (!admin && !vencidos.length && !vencendo.length) {
    return NextResponse.json({ ok: true, skipped: true, motivo: "nada vencido / a vencer" });
  }
  vencidos.sort((a, b) => a._st.dias - b._st.dias); // mais vencido primeiro
  vencendo.sort((a, b) => a._st.dias - b._st.dias); // vence antes primeiro

  const { subject, html, text } = montarEmailVencidos(vencidos, vencendo, { teste: !!admin });

  const res = await sendEmail({ to, subject, html, text });
  return NextResponse.json({ ok: res.ok, modo: admin ? "teste" : "agendado", para: admin ? to : undefined, vencidos: vencidos.length, vencendo: vencendo.length, enviado: res.ok, error: res.error });
}
