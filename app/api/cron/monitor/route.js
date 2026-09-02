// Cron Vercel — MONITOR dos crons. Lê os heartbeats e, se algum cron não roda
// há tempo demais ou falhou, manda 1 e-mail de alerta pros ADMINs. Roda 1x/dia
// (vercel.json). É o guarda-corpo contra cron morrer em silêncio.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { checarSaudeCrons, registrarExecucao } from "@/lib/cron-monitor";
import { conferirOQueOClienteVe } from "@/lib/conferencia-cliente";
import { aquecerBanco } from "@/lib/db-retry";

export const runtime = "nodejs";
export const maxDuration = 300; // a conferência do cliente simula a conciliação do CMR e lê o Syneco de cada portal publicado

const fmt = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "nunca");

export async function GET(req) {
  // Só Bearer CRON_SECRET (User-Agent é spoofável — SEC-01).
  const isCron = temCronSecret(req);
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await aquecerBanco(prisma).catch(() => {}); // acorda o Neon antes de ler os heartbeats
  const { problemas, heartbeats } = await checarSaudeCrons();
  // ⚠⚠ O MONITOR PASSA A OLHAR TAMBÉM O RESULTADO, não só se o processo rodou. Vitor (02/09/2026),
  // depois de achar sozinho o material "Comprado" com data de chegada no portal do cliente: "e vou
  // ter que pedir sempre para você verificar isso?".
  // Vai no MESMO e-mail de propósito: um alerta diário que o ADMIN já lê vale mais que um segundo
  // e-mail que ele aprende a arquivar. Ver lib/conferencia-cliente.js.
  const { achados } = await conferirOQueOClienteVe().catch(() => ({ achados: [] }));
  let alertaEnviado = false;

  if (problemas.length || achados.length) {
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
      const blocoCrons = problemas.length ? `
        <h2 style="color:#b91c1c;margin:0 0 8px">⚠ ${problemas.length} cron(s) com problema — Workspace Torg</h2>
        <p>Estes processos automáticos não rodaram como esperado:</p>
        <ul style="padding-left:18px">${linhas}</ul>
        <p style="font-size:12px;color:#6b7280">Confira na Vercel (agendamento do cron), o <code>CRON_SECRET</code> e os logs da função.</p>` : "";
      const blocoCliente = achados.length ? `
        <h2 style="color:#b45309;margin:${problemas.length ? "20px" : "0"} 0 8px">👁 ${achados.length} ponto(s) no que o cliente vê</h2>
        <p>Estes processos rodaram, mas o resultado não fecha — e está visível no portal do cliente:</p>
        <ul style="padding-left:18px">${achados.map((a) => `<li style="margin-bottom:6px"><b>${a.titulo}</b><br><span style="font-size:13px">${a.detalhe}</span><br><span style="color:#888;font-size:12px">Onde resolver: ${a.onde}</span></li>`).join("")}</ul>` : "";
      const html = `<div style="font-family:Arial,sans-serif;color:#1f2937">
        ${blocoCrons}${blocoCliente}
        <p style="font-size:12px;color:#6b7280">Alerta automático do monitor do Workspace.</p>
      </div>`;
      const assunto = [problemas.length ? `${problemas.length} cron(s) com problema` : null,
                       achados.length ? `${achados.length} ponto(s) no portal do cliente` : null].filter(Boolean).join(" · ");
      const res = await sendEmail({ to, subject: `⚠ ${assunto} — Workspace`, html });
      alertaEnviado = !!res?.ok;
    }
  }

  await registrarExecucao("monitor", { ok: true, mensagem: `${problemas.length} problema(s) · ${achados.length} no portal do cliente` });
  return NextResponse.json({ ok: true, problemas: problemas.length, alertaEnviado, detalhes: problemas, cliente: achados, heartbeats });
}
