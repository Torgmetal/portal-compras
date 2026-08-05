// Cálculo dos indicadores ISO de QUALIDADE (série mensal + acumulado do ano), do dado
// real do portal. Usado pela API do painel e pelo PDF de acompanhamento. Os 4 da
// planilha: RNCs do cliente, recorrência de NC, plano de auditorias, plano de calibração.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";

const arr12 = () => Array.from({ length: 12 }, () => null);
const zeros12 = () => Array.from({ length: 12 }, () => 0);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const AUD_OK = new Set(["REALIZADA", "EMITIDO", "FINALIZADO"]);

/** @returns { indicadores: [{...def, serie:[12], acumulado}] } */
export async function indicadoresQualidadeIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const series = {}, acumulados = {};

  const rncs = await prisma.naoConformidade.findMany({ where: { data: { gte: yIni, lt: yFim } }, select: { data: true, tipo: true, origem: true, pertinente: true, recorrente: true } });

  // RNCs recebidas do cliente — contagem de pertinentes por mês (acumulado = total do ano).
  { const s = zeros12(); let tot = 0;
    for (const r of rncs) { if ((r.origem === "CLIENTE" || r.tipo === "CLIENTE") && r.pertinente) { s[r.data.getUTCMonth()] += 1; tot += 1; } }
    series.rnc_cliente = s; acumulados.rnc_cliente = tot; }

  // Recorrência de NC — % de NCs recorrentes (acumulado = % do ano).
  { const rec = arr12(), tt = arr12(); let recA = 0, totA = 0;
    for (const r of rncs) { const m = r.data.getUTCMonth(); tt[m] = (tt[m] || 0) + 1; totA += 1; if (r.recorrente) { rec[m] = (rec[m] || 0) + 1; recA += 1; } }
    series.recorrencia_nc = rec.map((v, m) => pct(v || 0, tt[m] || 0)); acumulados.recorrencia_nc = pct(recA, totA); }

  // Plano de auditorias internas — % realizadas ÷ VENCIDAS (a auditoria só entra na
  // conta quando a data programada já passou; as agendadas pra depois não contam como
  // "não cumprida"). Acumulado = % do ano (só as vencidas).
  { const aud = await prisma.auditoriaInterna.findMany({ where: { dataAuditoria: { gte: yIni, lt: yFim } }, select: { dataAuditoria: true, status: true } });
    const hoje = new Date();
    const real = arr12(), plan = arr12(); let realA = 0, planA = 0;
    for (const a of aud) {
      if (a.dataAuditoria > hoje) continue; // programada pra depois — ainda não venceu
      const m = a.dataAuditoria.getUTCMonth(); plan[m] = (plan[m] || 0) + 1; planA += 1;
      if (AUD_OK.has(a.status)) { real[m] = (real[m] || 0) + 1; realA += 1; }
    }
    series.plano_auditorias = real.map((v, m) => pct(v || 0, plan[m] || 0)); acumulados.plano_auditorias = pct(realA, planA); }

  // Plano de calibração — % de equipamentos com calibração EM DIA. Base = documentos
  // da Qualidade categoria EQUIPAMENTOS (controle de documentos), ativos e com validade.
  // A vigência cobre o MÊS INTEIRO da validade (08/26 = coberto até 31/08 → vence só em
  // setembro). Meta 100% (nenhum vencido). Acumulado = status de hoje.
  { const eqs = await prisma.documentoQualidade.findMany({ where: { categoria: "EQUIPAMENTOS", ativo: true, dataValidade: { not: null } }, select: { dataValidade: true, dataEmissao: true } });
    const fimMs = (y, m) => Date.UTC(y, m + 1, 0); // último dia do mês, 00:00Z
    const s = arr12();
    for (let m = 0; m < 12; m++) {
      const fimM = fimMs(ano, m), proxMes = Date.UTC(ano, m + 1, 1);
      let base = 0, ok = 0;
      for (const e of eqs) {
        if (e.dataEmissao && new Date(e.dataEmissao).getTime() >= proxMes) continue; // ainda não existia nesse mês
        base++;
        const V = new Date(e.dataValidade);
        if (fimMs(V.getUTCFullYear(), V.getUTCMonth()) >= fimM) ok++; // vigência cobre o mês m
      }
      s[m] = base > 0 ? Math.round((ok / base) * 1000) / 10 : null;
    }
    series.plano_calibracao = s;
    const now = new Date(), hojeMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let base = 0, ok = 0;
    for (const e of eqs) { base++; const V = new Date(e.dataValidade); if (fimMs(V.getUTCFullYear(), V.getUTCMonth()) >= hojeMs) ok++; }
    acumulados.plano_calibracao = base > 0 ? Math.round((ok / base) * 1000) / 10 : null; }

  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "QUALIDADE").map((ind) => ({
    ...ind, serie: series[ind.id] || arr12(), acumulado: acumulados[ind.id] ?? null,
  }));
  return { indicadores };
}
