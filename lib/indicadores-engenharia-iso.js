// Cálculo dos indicadores ISO da ENGENHARIA (série mensal + acumulado do ano). Usado pela API do
// painel, pelo PDF e pelo painel geral da Qualidade — uma conta só, um número só.
//
// Os 3 da planilha: aderência ao prazo de entrega do projeto, retrabalho gerado pela Engenharia e
// erros de projeto (RNCs).
//
// ⚠⚠ O RETRABALHO DA ENGENHARIA É PESO DE PEÇA, não contagem de RNC — e entra por APONTAMENTO
// (FORM 34), tenha RNC aberta ou não (Vitor, 29/08/2026). É a mesma base da Produção. Vitor (28/08/2026): "um dos
// indicadores é retrabalho, que será somado de acordo com as peças que forem abertas RNC e que for
// de responsabilidade da engenharia". É a MESMA base e a MESMA meta (≤2%) do retrabalho da Produção
// — peso retrabalhado ÷ peso produzido (cortado) no mês —, mudando só o numerador: aqui entram só
// os apontamentos cuja origem foi apontada como Engenharia. Assim os dois índices são comparáveis,
// e cada setor responde pelo que causou.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { retrabalhoDoAno, SETOR_RETRABALHO } from "@/lib/retrabalho";
import { esperaDeFora } from "@/lib/etapa-projeto";

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
 * O registro de retrabalho veio de uma RNC?
 * ⚠ A RNC com peças gera um apontamento espelho (fonte APONTAMENTO, com `numeroRnc`); a RNC sem
 * apontamento entra direto (fonte RNC). Os dois contam. Apontamento de fábrica sem número de RNC,
 * não — é o que separa "erro apurado" de "anotação de quem preencheu a planilha".
 */
export const ehDeRnc = (r) => r?.fonte === "RNC" || !!r?.numeroRnc;

/**
 * @returns {{ indicadores: [{...def, serie:[12], acumulado}], retrabalho }}
 */
export async function indicadoresEngenhariaIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const hoje = new Date();
  const mesAtual = ano < hoje.getUTCFullYear() ? 11 : ano > hoje.getUTCFullYear() ? -1 : hoje.getUTCMonth();
  const series = {};

  // ── ADERÊNCIA AO PRAZO — os itens das tarefas do cronograma, pela DATA REAL, e a tarefa vencida
  // entra como ATRASO mesmo sem ter sido baixada. Vitor (28/08/2026): "sobre a aderência será em
  // cima dos itens das tarefas do cronograma, porém precisamos deixar as datas reais e as que
  // estiverem em atraso você deve apontar".
  //
  // ⚠⚠ ERA AQUI QUE O ÍNDICE MENTIA: contando só o que foi concluído, 98 tarefas vencidas e em
  // aberto não pesavam nada — o indicador media a pontualidade de quem baixou a tarefa, não a
  // saúde do cronograma. Agora cada mês tem:
  //   · as CONCLUÍDAS naquele mês (pela data real) — no prazo se real ≤ prevista;
  //   · as VENCIDAS E EM ABERTO cujo prazo caiu naquele mês — sempre como atraso.
  // Uma tarefa nunca conta duas vezes: ou tem data real (foi concluída), ou está em aberto.
  { const [concluidas, vencidas] = await Promise.all([
      prisma.cronogramaTarefa.findMany({
        // ⚠⚠ SUMMARY FORA. A linha de agrupamento do MS Project (`isSummary`) não é trabalho: ela é
        // o pai que resume as filhas, e as datas dela derivam delas. Contando as duas, a mesma
        // entrega pesa duas vezes no índice — são 23 linhas de agrupamento em 130 tarefas de
        // Engenharia neste ano, quase 1 em cada 5.
        where: { departamento: "ENGENHARIA", isSummary: false, dataFimReal: { gte: yIni, lt: yFim }, dataFimPrevista: { not: null } },
        select: { dataFimReal: true, dataFimPrevista: true },
      }),
      prisma.cronogramaTarefa.findMany({
        // ⚠ o corte é o menor entre HOJE e o fim do ano: em ano fechado, "vencida" é o ano inteiro;
        // no ano corrente, só até hoje — mês futuro não tem atraso.
        where: { departamento: "ENGENHARIA", isSummary: false, dataFimReal: null, dataFimPrevista: { gte: yIni, lt: hoje < yFim ? hoje : yFim } },
        select: { dataFimPrevista: true, motivoBloqueio: true, dataLiberacao: true, esperaDe: true },
      }),
    ]);
    const ok = arr12().map(() => 0), tot = arr12().map(() => 0);
    for (const x of concluidas) { const m = x.dataFimReal.getUTCMonth(); tot[m]++; if (x.dataFimReal <= x.dataFimPrevista) ok[m]++; }
    // ⚠⚠ ESPERA DE FORA NÃO É ATRASO DO SETOR. Vitor (29/08/2026) escolheu o campo "de quem se
    // espera" exatamente para isto: a tarefa parada aguardando o cliente aprovar sai da conta — o
    // setor não controla a resposta dele. Esperar OUTRO SETOR DA TORG continua contando: é
    // problema de casa, e sem essa distinção o hold viraria porta de saída para qualquer atraso.
    for (const x of vencidas) {
      const parada = !!(x.motivoBloqueio && !x.dataLiberacao);
      if (parada && esperaDeFora(x)) continue;
      const m = x.dataFimPrevista.getUTCMonth(); tot[m]++;
    }
    series.aderencia_prazo_projeto = tot.map((t, m) => (m > mesAtual ? null : pct(ok[m], t)));
  }

  // ── RETRABALHO GERADO PELA ENGENHARIA — peso das peças das RNCs de responsabilidade da
  // Engenharia ÷ peso produzido (cortado) no mês.
  //
  // ⚠⚠ O APONTAMENTO CONTA, COM OU SEM RNC. Vitor (29/08/2026), depois de ver que o índice marcava
  // 0% com 1.980 kg registrados: "para esses casos marcar como apontamento e deixar descrito no
  // indicador".
  //
  // ⚠ A regra anterior (só com RNC, 28/08) deixava a Engenharia fora de comparação: o indicador de
  // retrabalho da PRODUÇÃO sempre contou todo apontamento do FORM 34, com RNC ou sem. Com a
  // Engenharia exigindo RNC, a Produção aparecia com o retrabalho inteiro e a Engenharia com zero —
  // e "0% verde" se lê como "não gerou retrabalho", quando dois desenhos sem uma chapa custaram
  // 1,8 t em 14/08. Agora as duas usam a MESMA base, e o detalhamento diz, linha a linha, quais
  // têm RNC e quais são só apontamento.
  const retrab = await retrabalhoDoAno(prisma, ano);
  { const kg = arr12().map(() => 0);
    for (const r of retrab.registros) {
      if (SETOR_RETRABALHO[r.setor]?.processo !== "ENGENHARIA") continue;
      kg[r.mes] += r.kg || 0;
    }
    series.retrabalho_engenharia = kg.map((v, m) => pct(v, retrab.producao[m]));
  }

  // ── Erros de projeto — contagem das RNCs de Engenharia/Projeto no mês. A meta (≤8) é do
  // ANO e vale contra o acumulado, não contra o mês — ver `periodo: "ANO"` em indicadores-iso.
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
