// Cálculo do indicador ISO do PCP (série mensal + acumulado do ano). Usado pela API do painel e
// pelo PDF, no mesmo padrão dos outros setores.
//
// Vitor (26/08/2026): "o KPI será o cumprimento do plano de produção: a data informada para o setor
// que o planejamento desce × o que foi realizado".
import { INDICADORES_ISO } from "@/lib/indicadores-iso";

const arr12 = () => Array.from({ length: 12 }, () => null);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const media = (serie) => {
  const v = serie.filter((x) => x != null);
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
};

// ⚠ A SÉRIE COMEÇA EM AGO/2026 porque o DIA da liberação nasceu em 26/08/2026. Antes disso a
// liberação não tinha data programada — não existe "plano" para comparar, e um 0% inventado nos
// meses anteriores estragaria o acumulado e a leitura do ano.
const PLANO_DESDE = Date.UTC(2026, 7, 1);

// Concluída = passou do corte. `corteConcluidoEm` é o carimbo do corte; o status adiantado cobre a
// peça que andou sem o carimbo ter sido escrito (a mesma regra de `pecaCortada`).
const PASSOU = new Set(["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"]);

/** @returns { indicadores: [{...def, serie:[12], acumulado}], detalhe: [...] } */
export async function indicadoresPcpIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const desde = new Date(Math.max(yIni.getTime(), PLANO_DESDE));
  const series = {};
  const detalhe = [];

  // ⚠⚠ DIA QUE AINDA NÃO ACABOU NÃO É PLANO DESCUMPRIDO. Um lote programado para HOJE seria lido
  // como 0% a manhã inteira e só viraria verdade à meia-noite — o indicador abriria em vermelho
  // todo dia útil, e um indicador que mente de manhã ninguém olha à tarde. Só entra na conta o
  // lote cujo dia já passou.
  const ontem = new Date(); ontem.setUTCHours(0, 0, 0, 0);
  const ate = new Date(Math.min(yFim.getTime(), ontem.getTime()));

  const libs = desde < ate
    ? await prisma.liberacaoProducao.findMany({
        where: { dataProgramada: { gte: desde, lt: ate }, status: { notIn: ["CANCELADA"] } },
        select: { id: true, opNumero: true, frente: true, dataProgramada: true, pecaIds: true, totalKg: true },
        orderBy: { dataProgramada: "asc" },
      })
    : [];

  const ids = [...new Set(libs.flatMap((l) => (Array.isArray(l.pecaIds) ? l.pecaIds : [])))];
  const pecas = ids.length
    ? await prisma.pecaConjunto.findMany({
        where: { id: { in: ids } },
        select: { id: true, marca: true, pesoTotalKg: true, corteConcluidoEm: true, status: true, qte: true, qteProduzida: true },
      })
    : [];
  const porId = new Map(pecas.map((p) => [p.id, p]));

  const plan = arr12(), feito = arr12();
  for (const l of libs) {
    const m = l.dataProgramada.getUTCMonth();
    // ⚠ ATÉ O FIM DO DIA PROGRAMADO: cortar no dia é cumprir. Comparar com o instante da
    // liberação reprovaria todo lote feito à tarde.
    const limite = new Date(l.dataProgramada); limite.setUTCHours(23, 59, 59, 999);
    const lote = (Array.isArray(l.pecaIds) ? l.pecaIds : []).map((id) => porId.get(id)).filter(Boolean);
    // ⚠ liberação de FRENTE INTEIRA (sem pecaIds) fica de fora: sem saber quais peças foram
    // prometidas, qualquer número seria chute — e chute num indicador da ISO é pior que lacuna.
    if (!lote.length) continue;

    let kgPlan = 0, kgFeito = 0, nFeito = 0;
    for (const p of lote) {
      const kg = Number(p.pesoTotalKg) || 0;
      kgPlan += kg;
      const ok = (p.corteConcluidoEm && p.corteConcluidoEm <= limite)
        || PASSOU.has(p.status)
        || (Number(p.qteProduzida) || 0) >= (Number(p.qte) || 1);
      if (ok) { kgFeito += kg; nFeito++; }
    }
    plan[m] = (plan[m] || 0) + kgPlan;
    feito[m] = (feito[m] || 0) + kgFeito;
    detalhe.push({
      id: l.id, opNumero: l.opNumero, frente: l.frente,
      dia: l.dataProgramada.toISOString().slice(0, 10),
      pecas: lote.length, pecasFeitas: nFeito,
      kgPlanejado: Math.round(kgPlan), kgFeito: Math.round(kgFeito),
      pct: pct(kgFeito, kgPlan),
    });
  }

  series.cumprimento_plano = plan.map((p, m) =>
    (Date.UTC(ano, m, 1) < PLANO_DESDE ? null : pct(feito[m] || 0, p || 0)));

  // ⚠ mês futuro não é 0%: é sem dado. Programar para outubro e medir em agosto daria vermelho
  // no que ainda nem começou.
  const hoje = new Date();
  const mesAtual = ano < hoje.getUTCFullYear() ? 11 : ano > hoje.getUTCFullYear() ? -1 : hoje.getUTCMonth();

  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "PCP").map((ind) => {
    const auto = series[ind.id] || arr12();
    const serie = auto.map((v, m) => (m > mesAtual ? null : v));
    return { ...ind, serie, acumulado: media(serie) };
  });
  return { indicadores, detalhe: detalhe.sort((a, b) => String(b.dia).localeCompare(String(a.dia))) };
}
