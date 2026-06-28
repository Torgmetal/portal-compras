// Cron Vercel — MONITOR dos crons. Lê os heartbeats e, se algum cron não roda
// há tempo demais ou falhou, manda 1 e-mail de alerta pros ADMINs. Roda 1x/dia
// (vercel.json). É o guarda-corpo contra cron morrer em silêncio.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { checarSaudeCrons, registrarExecucao } from "@/lib/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

const fmt = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "nunca");

export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  const ua = req.headers.get("user-agent") || "";
  const isCron = ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { problemas, heartbeats } = await checarSaudeCrons();
  let alertaEnviado = false;

  if (problemas.length) {
    // Destinatários: ADMINs ativos + env CRON_ALERTA_EMAILS (dedup)
    const env = (process.env.CRON_ALERTA_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
    let admins = [];
    try {
      const us = await prisma.user.findMany({ where: { tipo: "ADMIN", ativo: true }, select: { email: true } });
      admins = us.map((u) => u.email).filter(Boolean);
    } catch { /* não-fatal */ }
    const to = [...new Set([...admins, ...env])];

    if (to.length) {
      const linhas = problemas
        .map((p) => `<li style="margin-bottom:4px"><b>${p.label}</b> <span style="color:#888">(${p.job})</span> — ${p.motivo}. Última execução: ${fmt(p.ultimo)}.${p.mensagem ? `<br><span style="color:#888;font-size:12px">${p.mensagem}</span>` : ""}</li>`)
        .join("");
      const html = `<div style="font-family:Arial,sans-serif;color:#1f2937">
        <h2 style="color:#b91c1c;margin:0 0 8px">⚠ ${problemas.length} cron(s) com problema — Workspace Torg</h2>
        <p>Estes processos automáticos não rodaram como esperado:</p>
        <ul style="padding-left:18px">${linhas}</ul>
        <p style="font-size:12px;color:#6b7280">Confira na Vercel (agendamento do cron), o <code>CRON_SECRET</code> e os logs da função. Alerta automático do monitor de crons.</p>
      </div>`;
      const res = await sendEmail({ to, subject: `⚠ ${problemas.length} cron(s) com problema — Workspace`, html });
      alertaEnviado = !!res?.ok;
    }
  }

  await registrarExecucao("monitor", { ok: true, mensagem: `${problemas.length} problema(s)` });
  return NextResponse.json({ ok: true, problemas: problemas.length, alertaEnviado, detalhes: problemas, heartbeats });
}
