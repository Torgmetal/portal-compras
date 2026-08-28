// Cálculo dos indicadores ISO da ENGENHARIA (série mensal + acumulado do ano). Usado pela API do
// painel, pelo PDF e pelo painel geral da Qualidade — uma conta só, um número só.
//
// Os 3 da planilha: aderência ao prazo de entrega do projeto, retrabalho gerado pela Engenharia e
// erros de projeto (RNCs).
//
// ⚠⚠ O RETRABALHO DA ENGENHARIA É PESO DE PEÇA, não contagem de RNC. Vitor (28/08/2026): "um dos
// indicadores é retrabalho, que será somado de acordo com as peças que forem abertas RNC e que for
// de responsabilidade da engenharia". É a MESMA base e a MESMA meta (≤2%) do retrabalho da Produção
// — peso retrabalhado ÷ peso produzido (cortado) no mês —, mudando só o numerador: aqui entram só
// os apontamentos cuja origem foi apontada como Engenharia. Assim os dois índices são comparáveis,
// e cada setor responde pelo que causou.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { retrabalhoDoAno, serieDoProcesso } from "@/lib/retrabalho";

const arr12 = () => Array.from({ length: 12 }, () => null);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const media = (serie) => {
  const v = serie.filter((x) => x != null);
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
};
const soma = (serie) => {
  const v = serie.filter((x) => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) : null;
};

/** RNC de projeto: a área/processo aponta Engenharia ou Projeto. */
export const EH_RNC_DE_PROJETO = /ENGENH|PROJET/i;

/**
 * @returns {{ indicadores: [{...def, serie:[12], acumulado}], retrabalho }}
 */
export async function indicadoresEngenhariaIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const hoje = new Date();
  const mesAtual = ano < hoje.getUTCFullYear() ? 11 : ano > hoje.getUTCFullYear() ? -1 : hoje.getUTCMonth();
  const series = {};

  // ── Aderência ao prazo de entrega do projeto — tarefas de Engenharia do cronograma:
  // concluídas dentro da data prevista ÷ concluídas no mês.
  // ⚠ depende de a data REAL de conclusão estar preenchida no cronograma; tarefa entregue e não
  // baixada não entra em lugar nenhum — nem como atraso, nem como acerto.
  { const tar = await prisma.cronogramaTarefa.findMany({
      where: { departamento: "ENGENHARIA", dataFimReal: { gte: yIni, lt: yFim }, dataFimPrevista: { not: null } },
      select: { dataFimReal: true, dataFimPrevista: true },
    });
    const ok = arr12().map(() => 0), tot = arr12().map(() => 0);
    for (const x of tar) { const m = x.dataFimReal.getUTCMonth(); tot[m]++; if (x.dataFimReal <= x.dataFimPrevista) ok[m]++; }
    series.aderencia_prazo_projeto = tot.map((t, m) => (m > mesAtual ? null : pct(ok[m], t)));
  }

  // ── Retrabalho gerado pela Engenharia — peso das peças das RNCs/apontamentos de origem
  // Engenharia ÷ peso produzido no mês.
  const retrab = await retrabalhoDoAno(prisma, ano);
  series.retrabalho_engenharia = serieDoProcesso(retrab, "ENGENHARIA").serie;

  // ── Erros de projeto — contagem das RNCs de Engenharia/Projeto no mês (meta 0).
  { const rncs = await prisma.naoConformidade.findMany({
      where: { data: { gte: yIni, lt: yFim } },
      select: { data: true, processoArea: true },
    });
    const s = arr12();
    for (let m = 0; m <= mesAtual; m++) s[m] = 0;
    for (const r of rncs) {
      if (!EH_RNC_DE_PROJETO.test(r.processoArea || "")) continue;
      const m = r.data.getUTCMonth();
      if (m <= mesAtual) s[m] += 1;
    }
    series.erros_projeto = s;
  }

  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "ENGENHARIA").map((ind) => {
    const serie = (series[ind.id] || arr12()).map((v, m) => (m > mesAtual ? null : v));
    // contagem acumula somando; percentual, pela média dos meses medidos
    const acumulado = ind.meta?.unidade === "%" ? media(serie) : soma(serie);
    return { ...ind, serie, acumulado };
  });
  return { indicadores, retrabalho: retrab };
}
