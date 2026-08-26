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

// ─── OPR MENSAL TORG — os meses já apurados à mão ─────────────────────────────
// Vitor (26/08/2026) mandou as planilhas de jan–mai/2026 para preencher a série.
//
// O OPR é a mesma pergunta deste KPI, medida do jeito que a casa media antes do portal: por SETOR,
// peso realizado contra a meta do mês. Os números aqui são transcritos das planilhas; os % por
// setor conferem com os que elas mostram (jan: 130 · 51 · 52 · 62 · 56 · 54 · 81).
//
// ⚠⚠ O MÊS APURADO E O MÊS AUTOMÁTICO NÃO MEDEM A MESMA COISA, e uma série que troca de método no
// meio do ano sem dizer é armadilha num documento de ISO:
//   jan–mai (OPR)  = peso de CADA SETOR no mês ÷ meta do setor. Mede o mês inteiro contra a meta.
//   ago em diante  = peso concluído até o DIA programado ÷ peso programado para aquele dia.
//     Mede lote a lote, dia a dia — é mais exigente: entregar no mês certo e no dia errado conta
//     como não cumprido.
// Por isso a queda de ago em diante não é necessariamente piora: é régua mais curta.
//
// ⚠ O % DO MÊS É PONDERADO (Σ realizado ÷ Σ meta), não a média dos sete setores. Média simples dá
// o mesmo peso a um setor de 200 t e a um de 20 t. Os dois números ficam próximos (jan 67,9% vs
// 69,5%), mas o ponderado é o que responde "quanto do plano da casa saiu".
export const HISTORICO_OPR = {
  2026: {
    0: { nome: "Janeiro", setores: { Corte: [260945.70, 200000.00], Montagem: [135101.00, 267412.59], Solda: [129715.10, 250000.00], Acabamento: [155168.20, 250000.00], Jato: [129742.40, 230000.00], Pintura: [125283.40, 230000.00], "Expedição": [202428.29, 250168.48] }, absDiario: 5, absGeral: 10 },
    1: { nome: "Fevereiro", setores: { Corte: [197252.70, 225000.00], Montagem: [124204.20, 197000.00], Solda: [168188.60, 160000.00], Acabamento: [248649.90, 180000.00], Jato: [162139.50, 212000.00], Pintura: [165219.40, 218375.00], "Expedição": [296423.14, 291743.49] }, absDiario: 3, absGeral: 9, kgHH: 52.63 },
    2: { nome: "Março", setores: { Corte: [224051.60, 210000.00], Montagem: [139122.90, 217034.98], Solda: [151825.20, 170000.00], Acabamento: [166814.30, 201650.00], Jato: [191109.20, 180000.00], Pintura: [194596.20, 180000.00], "Expedição": [370123.49, 304778.66] }, absDiario: 11, absGeral: 8, kgHH: 53.11 },
    3: { nome: "Abril", setores: { Corte: [143349.68, 283026.08], Montagem: [115174.20, 267182.38], Solda: [137788.30, 235094.52], Acabamento: [232864.30, 235094.52], Jato: [171395.20, 342000.00], Pintura: [165757.60, 342000.00], "Expedição": [265970.08, 427750.87] }, absDiario: 11, absGeral: 12 },
    4: { nome: "Maio", setores: { Corte: [149539.10, 236962.35], Montagem: [105360.40, 282287.80], Solda: [78636.70, 265414.00], Acabamento: [69726.40, 335414.00], Jato: [107934.40, 385764.58], Pintura: [196381.30, 385764.58], "Expedição": [210031.37, 388364.58] }, absDiario: 14, absGeral: 14 },
  },
};

/** % do mês pelo OPR (ponderado), ou null se aquele mês não foi apurado à mão. */
export function historicoOpr(ano, mes) {
  const d = HISTORICO_OPR[ano]?.[mes];
  if (!d) return null;
  const vals = Object.values(d.setores);
  const peso = vals.reduce((s, [p]) => s + p, 0);
  const meta = vals.reduce((s, [, t]) => s + t, 0);
  return meta > 0 ? Math.round((peso / meta) * 1000) / 10 : null;
}

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

  // ⚠ o mês apurado no OPR MANDA sobre o cálculo automático — é o registro oficial daquele mês,
  // e nas telas da ISO o que vale é o que foi apurado, não o que o portal recalcularia hoje.
  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "PCP").map((ind) => {
    const auto = series[ind.id] || arr12();
    const serie = auto.map((v, m) => {
      if (ind.id === "cumprimento_plano") {
        const h = historicoOpr(ano, m);
        if (h != null) return h;
      }
      return m > mesAtual ? null : v;
    });
    return { ...ind, serie, acumulado: media(serie) };
  });
  return { indicadores, detalhe: detalhe.sort((a, b) => String(b.dia).localeCompare(String(a.dia))) };
}
