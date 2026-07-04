// GET /api/admin/sincronizacoes → status de todos os crons (heartbeats) + saúde
// das integrações externas (config + último estado no banco). Só ADMIN.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { CRONS_ESPERADOS } from "@/lib/cron-monitor";

export const runtime = "nodejs";

function situacaoCron(c, hb) {
  if (!hb || !hb.lastOkAt) return "NUNCA";
  const horas = (Date.now() - new Date(hb.lastOkAt).getTime()) / 36e5;
  if (horas > c.maxHoras) return "ATRASADO";
  if (!hb.ok) return "FALHOU";
  return "OK";
}

export async function GET() {
  try {
    await requireAcesso({ tipos: ["ADMIN"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const hbs = await prisma.cronHeartbeat.findMany();
  const map = new Map(hbs.map((h) => [h.job, h]));
  const crons = CRONS_ESPERADOS.map((c) => {
    const hb = map.get(c.job) || null;
    return {
      job: c.job, label: c.label, path: c.path, maxHoras: c.maxHoras,
      situacao: situacaoCron(c, hb),
      lastRunAt: hb?.lastRunAt || null, lastOkAt: hb?.lastOkAt || null,
      ok: hb?.ok ?? null, mensagem: hb?.mensagem || null, duracaoMs: hb?.duracaoMs ?? null,
    };
  });

  // Saúde das integrações — configuração (env) + último estado conhecido (sem ping ao vivo).
  const env = (k) => !!process.env[k];
  const [omie, sp, mes] = await Promise.all([
    prisma.omieSyncState.findFirst({ orderBy: { updatedAt: "desc" }, select: { ultimoSync: true, updatedAt: true } }).catch(() => null),
    prisma.sharepointSync.findFirst({ orderBy: { criadoEm: "desc" }, select: { sucesso: true, criadoEm: true, mensagem: true, erro: true } }).catch(() => null),
    prisma.mesSyncLog.findFirst({ orderBy: { criadoEm: "desc" }, select: { sucesso: true, criadoEm: true, erro: true } }).catch(() => null),
  ]);

  const integracoes = [
    { nome: "Omie ERP", configurada: env("OMIE_APP_KEY") && env("OMIE_APP_SECRET"), ultimaSync: omie?.ultimoSync || omie?.updatedAt || null, sucesso: null, detalhe: "Pedidos, OS, estoque, contas" },
    { nome: "SharePoint", configurada: env("SHAREPOINT_DRIVE_ID"), ultimaSync: sp?.criadoEm || null, sucesso: sp?.sucesso ?? null, detalhe: sp?.erro || sp?.mensagem || "Planejamento e docs RH" },
    { nome: "MES / Syneco", configurada: env("MES_SYNC_API_KEY"), ultimaSync: mes?.criadoEm || null, sucesso: mes?.sucesso ?? null, detalhe: mes?.erro || "Apontamentos do chão de fábrica" },
    { nome: "Resend (e-mail)", configurada: env("RESEND_API_KEY"), ultimaSync: null, sucesso: null, detalhe: "E-mails transacionais" },
    { nome: "Claude (Anthropic)", configurada: env("ANTHROPIC_API_KEY"), ultimaSync: null, sucesso: null, detalhe: "Parser de PDF / assistente" },
    { nome: "Vercel Blob", configurada: env("BLOB_READ_WRITE_TOKEN"), ultimaSync: null, sucesso: null, detalhe: "Armazenamento de arquivos" },
    { nome: "SigissWeb (NFS-e)", configurada: env("SIGISS_URL") && env("SIGISS_LOGIN"), ultimaSync: null, sucesso: null, detalhe: "NFS-e Conchal" },
  ];

  const resumo = {
    ok: crons.filter((c) => c.situacao === "OK").length,
    problemas: crons.filter((c) => c.situacao !== "OK").length,
  };

  return NextResponse.json({ success: true, crons, integracoes, resumo, cronSecretConfigurado: env("CRON_SECRET") });
}
