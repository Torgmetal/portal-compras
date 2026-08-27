// Cálculo dos indicadores ISO de QUALIDADE (série mensal + acumulado do ano), do dado
// real do portal. Usado pela API do painel e pelo PDF de acompanhamento. Os 4 da
// planilha: RNCs do cliente, recorrência de NC, plano de auditorias, plano de calibração.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";

const arr12 = () => Array.from({ length: 12 }, () => null);
const zeros12 = () => Array.from({ length: 12 }, () => 0);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const AUD_OK = new Set(["REALIZADA", "EMITIDO", "FINALIZADO"]);

/** @returns { indicadores: [{...def, serie:[12], acumulado}] } */
// Valores apurados fora do portal e informados pela Diretoria — mesma ideia do
// HISTORICO_PRODUCAO. Índice 0 = janeiro; null = vale o cálculo do portal.
//
// ⚠ NÃO É "CHUTE BONITO": é o que a Qualidade apurava antes de o módulo existir. Fica aqui, com a
// data e a origem, para ninguém confundir com número medido pelo portal.
export const HISTORICO_QUALIDADE = {
  2026: {
    // Vitor, 27/08/2026 — o registro de auditoria interna no portal começa em agosto.
    plano_auditorias: [100, 100, 100, 100, 100, 100, 100, null, null, null, null, null],
  },
};

export async function indicadoresQualidadeIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const series = {}, acumulados = {};

  const rncs = await prisma.naoConformidade.findMany({ where: { data: { gte: yIni, lt: yFim } }, select: { data: true, tipo: true, origem: true, pertinente: true, recorrente: true } });

  // RNCs recebidas do cliente — a QUANTIDADE DE CADA MÊS. Vitor (27/08/2026): "temos 4 RNCs de
  // clientes e você listou bem mais; deve vincular a quantidade dentro de cada mês".
  //
  // ⚠⚠ A SÉRIE ERA ACUMULADA, e isso enganava no PDF. Saía 0·0·0·2·2·2·4·4 — as mesmas 4 RNCs
  // repetidas de abril em diante; quem lê a linha soma 14. A ideia era comparar com a meta anual
  // (≤8), mas para isso já existe a coluna do ACUMULADO, que continua trazendo o total do ano.
  { const mensal = zeros12(); let tot = 0;
    for (const r of rncs) { if ((r.origem === "CLIENTE" || r.tipo === "CLIENTE") && r.pertinente) { mensal[r.data.getUTCMonth()] += 1; tot += 1; } }
    series.rnc_cliente = mensal; acumulados.rnc_cliente = tot; }

  // Recorrência de NC — % de NCs recorrentes (acumulado = % do ano).
  { const rec = arr12(), tt = arr12(); let recA = 0, totA = 0;
    for (const r of rncs) { const m = r.data.getUTCMonth(); tt[m] = (tt[m] || 0) + 1; totA += 1; if (r.recorrente) { rec[m] = (rec[m] || 0) + 1; recA += 1; } }
    // ⚠ MÊS SEM NENHUMA NC É 0%, NÃO VAZIO. Vitor (27/08/2026): "a recorrência de não conformidade
    // em março está em branco, pode ajustar e deixar 0%". Sem NC no mês não há NC recorrente — o
    // indicador é 0 por definição. Vazio ali se lê como "não medimos", que é outra coisa.
    // Mês futuro continua null: aí realmente ainda não há o que medir.
    const hojeM = new Date();
    const ultimoMes = ano < hojeM.getUTCFullYear() ? 11 : ano > hojeM.getUTCFullYear() ? -1 : hojeM.getUTCMonth();
    series.recorrencia_nc = rec.map((v, m) => (m > ultimoMes ? null : tt[m] ? pct(v || 0, tt[m]) : 0));
    acumulados.recorrencia_nc = pct(recA, totA); }

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
    // ⚠ JAN A JUL VÊM DO VITOR (27/08/2026): "para o cumprimento do plano de auditoria deixa como
    // 100% desde de janeiro; em agosto pode deixar o real". São valores INFORMADOS por ele — o
    // portal só passou a registrar auditoria interna em agosto, então antes disso não há o que
    // medir e o cálculo devolveria vazio.
    const calc = real.map((v, m) => pct(v || 0, plan[m] || 0));
    series.plano_auditorias = calc.map((v, m) => (HISTORICO_QUALIDADE[ano]?.plano_auditorias?.[m] ?? v));
    acumulados.plano_auditorias = pct(realA, planA); }

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
