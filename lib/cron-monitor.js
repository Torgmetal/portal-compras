// Monitor de crons — guarda-corpo contra cron morrer em silêncio.
// Cada cron chama registrarExecucao() ao terminar; o cron "monitor" usa
// checarSaudeCrons() pra alertar quando algum não roda há tempo demais ou falhou.
import { prisma } from "@/lib/prisma";
import { ehErroConexao } from "@/lib/db-retry";
import { log } from "@/lib/log";
import { AGENDA, toleranciaDoPath } from "@/lib/cron-agenda";

const registro = log("cron-monitor");

// Crons esperados. A LISTA é o cadastro; a TOLERÂNCIA vem da agenda do `vercel.json`
// (`lib/cron-agenda.js`) — ver ali por que ela deixou de ser um número escrito à mão.
//
// ⚠ `maxHoras` continua aceito como EXCEÇÃO, para o caso em que o dono do cron quer um limite mais
// apertado que a agenda justificaria. Sem ele, vale a folga derivada.
const ESPERADOS = [
  { job: "backup-banco",             label: "Backup do banco (SharePoint)", path: "/api/cron/backup-banco" },
  { job: "estoque-produtos",         label: "Estoque · produtos",          path: "/api/cron/estoque-produtos" },
  { job: "estoque-movimentacoes",    label: "Estoque · movimentações",     path: "/api/cron/estoque-movimentacoes" },
  { job: "sync-sharepoint",          label: "SharePoint · planejamento",   path: "/api/producao/sync-sharepoint" },
  { job: "sync-entregas",            label: "Conciliação de recebimento",  path: "/api/cron/sync-entregas" },
  { job: "faturamento",              label: "Faturamento (Omie)",          path: "/api/cron/faturamento" },
  { job: "financeiro",               label: "Financeiro (Omie)",           path: "/api/cron/financeiro" },
  { job: "qualidade-vencidos",       label: "Qualidade · doc. vencidos",   path: "/api/cron/qualidade-vencidos" },
  { job: "reconciliar-syneco-corte", label: "Baixa do corte (Syneco)",     path: "/api/cron/reconciliar-syneco-corte" },
  { job: "data-book",                label: "Data Book · volumes",         path: "/api/cron/data-book" },
  { job: "rnc-abertas",              label: "RNC sem movimento",           path: "/api/cron/rnc-abertas" },
  { job: "pasta-engenharia",         label: "Pasta da Engenharia",         path: "/api/cron/pasta-engenharia" },
  // ⚠ Faltava. Parou em 19/08 e ninguém soube até o cliente ver "Comprado" numa linha com data de
  // chegada — 74 itens de 11 OPs sem baixa de recebimento. É o que este monitor existe pra evitar.
  { job: "cmr-sincronizar",          label: "CMR · recebimento",           path: "/api/qualidade/cmr/sincronizar" },
  // ⚠ o casamento era manual e acumulou 162 certificados com PDF na pasta e sem vínculo (05/09/2026)
  { job: "casar-certificados",       label: "Certificados · casar PDFs",   path: "/api/cron/casar-certificados" },
  // ⚠⚠ OS SETE ABAIXO ESTAVAM AGENDADOS NA VERCEL E FORA DESTA LISTA (13/09/2026). Três deles
  // (produtos-omie, grd, orçamento) estavam quebrados havia meses pelo redirect do middleware e
  // ninguém soube, porque cron que não é cobrado morre calado — exatamente o buraco que fez o
  // `cmr-sincronizar` passar despercebido. O `conferirAgenda()` abaixo impede que volte a acontecer.
  { job: "monitor",                  label: "Monitor dos crons",           path: "/api/cron/monitor" },
  { job: "emails-engenharia",        label: "E-mails da Engenharia",       path: "/api/cron/emails-engenharia" },
  { job: "sync-fornecedores-omie",   label: "Fornecedores (Omie)",         path: "/api/cron/sync-fornecedores-omie" },
  { job: "cmr-reconciliar",          label: "CMR · reconciliação",         path: "/api/cron/cmr-reconciliar" },
  { job: "produtos-omie",            label: "Produtos (Omie)",             path: "/api/compras/produtos-omie/sincronizar" },
  { job: "grd-sincronizar",          label: "GRD · Engenharia",            path: "/api/engenharia/grd/sincronizar" },
  { job: "orcamento-sharepoint",     label: "Orçamentos (SharePoint)",     path: "/api/comercial/orcamento/importar-sharepoint" },
];

export const CRONS_ESPERADOS = ESPERADOS.map((c) => ({
  ...c, maxHoras: c.maxHoras ?? toleranciaDoPath(c.path) ?? 30,
}));

/**
 * Todo cron agendado na Vercel tem de estar no cadastro acima — e vice-versa.
 *
 * ⚠⚠ É A CONFERÊNCIA QUE NÃO EXISTIA. Um cron agendado e fora do cadastro nunca é cobrado: morre e
 * o monitor segue dizendo que está tudo bem. Um cron no cadastro e fora da agenda alerta para
 * sempre, porque nada vai executá-lo. O teste `testes/cron-agenda.teste.js` roda isto.
 */
export function conferirAgenda() {
  const cadastrados = new Set(ESPERADOS.map((c) => c.path));
  return {
    agendadosSemCadastro: [...AGENDA.keys()].filter((p) => !cadastrados.has(p)),
    cadastradosSemAgenda: ESPERADOS.map((c) => c.path).filter((p) => !AGENDA.has(p)),
  };
}

/**
 * Registra a execução de um cron (heartbeat). Nunca lança — uma falha de
 * bookkeeping não pode derrubar o cron de verdade.
 */
export async function registrarExecucao(job, { ok = true, mensagem = null, duracaoMs = null } = {}) {
  const agora = new Date();
  const dados = {
    create: { job, lastRunAt: agora, lastOkAt: ok ? agora : null, ok, mensagem: mensagem?.slice(0, 500) || null, duracaoMs },
    update: { lastRunAt: agora, ok, mensagem: mensagem?.slice(0, 500) || null, duracaoMs, ...(ok ? { lastOkAt: agora } : {}) },
  };
  // Retenta em erro transitório de conexão (cold start do Neon) — senão o heartbeat
  // não grava e o cron parece "morto" (lastRun congela) e o monitor alerta à toa.
  for (let i = 0; i < 4; i++) {
    try {
      await prisma.cronHeartbeat.upsert({ where: { job }, ...dados });
      return;
    } catch (e) {
      if (!ehErroConexao(e) || i === 3) {
        registro.erro("[cron-monitor] heartbeat falhou:", e?.message);
        return; // nunca lança — bookkeeping não pode derrubar o cron
      }
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
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
