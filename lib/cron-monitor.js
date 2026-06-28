// Monitor de crons — guarda-corpo contra cron morrer em silêncio.
// Cada cron chama registrarExecucao() ao terminar; o cron "monitor" usa
// checarSaudeCrons() pra alertar quando algum não roda há tempo demais ou falhou.
import { prisma } from "@/lib/prisma";

// Crons esperados + cadência. `maxHoras` = tempo máximo sem uma execução OK
// antes de considerar atrasado (com folga sobre o schedule do vercel.json).
export const CRONS_ESPERADOS = [
  { job: "estoque-produtos",         label: "Estoque · produtos",          maxHoras: 30 },
  { job: "estoque-movimentacoes",    label: "Estoque · movimentações",     maxHoras: 30 },
  { job: "sync-sharepoint",          label: "SharePoint · planejamento",   maxHoras: 30 },
  { job: "sync-entregas",            label: "Conciliação de recebimento",  maxHoras: 30 },
  { job: "faturamento",              label: "Faturamento (Omie)",          maxHoras: 30 },
  { job: "financeiro",               label: "Financeiro (Omie)",           maxHoras: 30 },
  { job: "qualidade-vencidos",       label: "Qualidade · doc. vencidos",   maxHoras: 200 }, // semanal (seg)
  { job: "reconciliar-syneco-corte", label: "Baixa do corte (Syneco)",     maxHoras: 30 },
];

/**
 * Registra a execução de um cron (heartbeat). Nunca lança — uma falha de
 * bookkeeping não pode derrubar o cron de verdade.
 */
export async function registrarExecucao(job, { ok = true, mensagem = null, duracaoMs = null } = {}) {
  const agora = new Date();
  try {
    await prisma.cronHeartbeat.upsert({
      where: { job },
      create: { job, lastRunAt: agora, lastOkAt: ok ? agora : null, ok, mensagem: mensagem?.slice(0, 500) || null, duracaoMs },
      update: { lastRunAt: agora, ok, mensagem: mensagem?.slice(0, 500) || null, duracaoMs, ...(ok ? { lastOkAt: agora } : {}) },
    });
  } catch (e) {
    console.error("[cron-monitor] heartbeat falhou:", e?.message);
  }
}

/**
 * Confere a saúde de todos os crons esperados contra os heartbeats gravados.
 * Retorna { problemas: [{ job, label, motivo, ultimo, mensagem }], heartbeats }.
 */
export async function checarSaudeCrons() {
  const hbs = await prisma.cronHeartbeat.findMany();
  const map = new Map(hbs.map((h) => [h.job, h]));
  const agora = Date.now();
  const problemas = [];

  for (const c of CRONS_ESPERADOS) {
    const hb = map.get(c.job);
    if (!hb || !hb.lastOkAt) {
      problemas.push({ job: c.job, label: c.label, motivo: "nunca executou com sucesso", ultimo: hb?.lastRunAt || null, mensagem: hb?.mensagem || null });
      continue;
    }
    const horas = (agora - new Date(hb.lastOkAt).getTime()) / 36e5;
    if (horas > c.maxHoras) {
      problemas.push({ job: c.job, label: c.label, motivo: `sem sucesso há ${Math.round(horas)}h (limite ${c.maxHoras}h)`, ultimo: hb.lastOkAt, mensagem: hb.mensagem || null });
    } else if (!hb.ok) {
      problemas.push({ job: c.job, label: c.label, motivo: "última execução falhou", ultimo: hb.lastRunAt, mensagem: hb.mensagem || null });
    }
  }
  return { problemas, total: CRONS_ESPERADOS.length, heartbeats: hbs };
}
