// ─── RETRABALHO POR SETOR ─────────────────────────────────────────────────────
// Vitor (27/08/2026): "preciso dessa informação para poder calcular os retrabalhos gerados pelos
// setores da Engenharia, Produção — que no caso envolve preparação, montagem, solda, acabamento,
// jato e pintura — e nos indicadores desses setores colocar essa informação. A meta será menor ou
// igual a 2%, em cima do peso total produzido no mês".
//
// ⚠⚠ O DENOMINADOR É O PESO CORTADO, E ISSO É DELIBERADO. Toda peça passa UMA vez pelo corte; somar
// a produção de todos os setores contaria a mesma peça cinco vezes e o percentual de retrabalho
// cairia por construção — quanto mais etapas, menor o índice, sem nada ter melhorado. É a mesma
// base que o indicador de Retrabalho da Produção já usa desde que existe.
//
// ⚠ UM SETOR POR RNC. O peso retrabalhado é atribuído a QUEM GEROU a não conformidade, não a quem
// vai refazer — senão a mesma peça entraria no índice de três setores e a soma dos percentuais
// deixaria de ter sentido. Quem refaz aparece na descrição da RNC.
import { whereSetorSyneco } from "./syneco-dia";

export const SETORES_RETRABALHO = [
  { id: "ENGENHARIA", nome: "Engenharia", processo: "ENGENHARIA", syneco: null },
  { id: "PREPARACAO", nome: "Preparação", processo: "PRODUCAO", syneco: "CORTE" },
  { id: "MONTAGEM", nome: "Montagem", processo: "PRODUCAO", syneco: "MONTAGEM" },
  { id: "SOLDA", nome: "Solda", processo: "PRODUCAO", syneco: "SOLDA" },
  { id: "ACABAMENTO", nome: "Acabamento", processo: "PRODUCAO", syneco: "ACABAMENTO" },
  { id: "JATO", nome: "Jato", processo: "PRODUCAO", syneco: "JATO" },
  { id: "PINTURA", nome: "Pintura", processo: "PRODUCAO", syneco: "PINTURA" },
  // ⚠ ESTES TRÊS NÃO ESTAVAM NO PEDIDO, MAS ESTÃO NOS DADOS. A planilha da Qualidade traz 34
  // apontamentos de Expedição (16), Movimentação/Logística/Transporte (15) e Qualidade (3). Deixá-los
  // de fora faria o total do mês ficar menor que a soma real e o índice da fábrica sair otimista.
  // Entram no total e na tabela; não viram card de indicador de setor (processo: null).
  { id: "EXPEDICAO", nome: "Expedição", processo: null, syneco: null },
  { id: "MOVIMENTACAO", nome: "Movimentação / logística", processo: null, syneco: null },
  { id: "QUALIDADE", nome: "Qualidade", processo: null, syneco: null },
  // ⚠⚠ NEM TODO RETRABALHO É NOSSO. Vitor (27/08/2026): "não listou o fornecedor, pode ajustar
  // isso". Material fora de especificação, galvanização que voltou manchada, serviço de terceiro
  // refeito — as horas são nossas, mas a causa não é de um setor da Torg. Sem esta opção, quem
  // preenche escolhe o setor que REFEZ e o índice de Montagem ou Pintura sobe por culpa alheia,
  // que é exatamente o tipo de número que faz o setor parar de confiar no indicador.
  //
  // Conta no TOTAL da fábrica (o retrabalho existiu e consumiu produção) e em nenhum setor.
  { id: "FORNECEDOR", nome: "Fornecedor / terceiro", processo: null, syneco: null, externo: true },
];
export const SETOR_RETRABALHO = Object.fromEntries(SETORES_RETRABALHO.map((s) => [s.id, s]));
export const META_RETRABALHO = 2; // % do peso produzido no mês, ≤

// ⚠ AS RNCs ANTIGAS NÃO TÊM O CAMPO. Elas trazem `processoArea` em texto livre ("Pintura /
// Jateamento", "Preparação / Corte") — sem este mapa, todo o histórico ficaria fora do indicador
// novo e o setor apareceria zerado no mês em que houve retrabalho.
const REGRAS = [
  ["ENGENHARIA", /engenh|projet/i],
  ["PREPARACAO", /prepara|corte|serra|plasma|oxicort/i],
  ["MONTAGEM", /montag/i],
  ["SOLDA", /solda|caldeir/i],
  ["ACABAMENTO", /acabament|esmeril|lixament|rebarb/i],
  ["JATO", /jato|jatea|granalha/i],
  ["PINTURA", /pintura|primer|tinta/i],
  ["EXPEDICAO", /expedi|embalag|carregament/i],
  ["MOVIMENTACAO", /movimenta|log[íi]stica|transporte|ponte rolante/i],
  ["QUALIDADE", /qualidade|inspe/i],
  ["FORNECEDOR", /fornecedor|terceir|galvaniza[çc]|subcontrat/i],
];
/** O setor de uma RNC: o campo explícito quando existe; senão, deduzido da área do processo. */
export function setorDaRnc(rnc) {
  const explicito = String(rnc?.setorRetrabalho || "").toUpperCase();
  if (SETOR_RETRABALHO[explicito]) return explicito;
  const texto = String(rnc?.processoArea || "");
  // ⚠ "Pintura / Jateamento" casa jato E pintura: vence a PRIMEIRA regra da lista, que segue a
  // ordem do processo (jato antes de pintura). Sem ordem, o resultado dependeria do objeto.
  for (const [id, rx] of REGRAS) if (rx.test(texto)) return id;
  return null;
}

/** O peso de uma lista de peças da RNC: soma de quantidade × peso unitário. */
export function pesoDasPecas(pecas) {
  if (!Array.isArray(pecas) || !pecas.length) return null;
  const total = pecas.reduce((s, p) => {
    const qtd = Number(p?.qtd) || 0;
    const un = Number(p?.pesoUnitKg) || 0;
    const kg = Number(p?.pesoKg);
    return s + (Number.isFinite(kg) && kg > 0 ? kg : qtd * un);
  }, 0);
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

const arr12 = () => Array.from({ length: 12 }, () => 0);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/**
 * A série do ano: peso retrabalhado por setor, a produção do mês e o percentual de cada um.
 *
 * @returns {{ producao:number[], porSetor:Record<string,number[]>, serie:Record<string,(number|null)[]>,
 *             total:(number|null)[], totalKg:number[], rncs:object[] }}
 */
export async function retrabalhoDoAno(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1));
  const yFim = new Date(Date.UTC(ano + 1, 0, 1));

  // produção do mês = peso cortado (ver o aviso do topo)
  const corte = await prisma.mesApontamento.findMany({
    where: { dataInicio: { gte: yIni, lt: yFim }, ...whereSetorSyneco("CORTE") },
    select: { dataInicio: true, produzidoKg: true },
  });
  const producao = arr12();
  for (const a of corte) producao[a.dataInicio.getUTCMonth()] += a.produzidoKg || 0;

  // ⚠⚠ A FONTE É O APONTAMENTO, NÃO A RNC. Dos 227 registros da planilha da Qualidade, a maioria
  // tem "Abrir RNC? Não" — é correção imediata no chão de fábrica. O indicador antigo olhava só
  // para RNCs com disposição Retrabalhar e enxergava uma fração do que acontece.
  //
  // ⚠ A RNC QUE TEM APONTAMENTO NÃO CONTA DUAS VEZES: o apontamento aponta para ela (`rncId`), e a
  // RNC só entra por fora quando não gerou apontamento.
  const aps = await prisma.apontamentoRetrabalho.findMany({
    where: { data: { gte: yIni, lt: yFim }, categoria: { in: ["RETRABALHO", "SUCATA", "NAO_CONFORME"] } },
    orderBy: { data: "asc" },
  });
  const comApontamento = new Set(aps.map((a) => a.rncId).filter(Boolean));
  const rncs = await prisma.naoConformidade.findMany({
    where: { disposicao: "RETRABALHAR", data: { gte: yIni, lt: yFim }, id: { notIn: [...comApontamento] } },
    select: {
      id: true, numero: true, ano: true, data: true, opNumero: true, processoArea: true,
      setorRetrabalho: true, pesoRetrabalhoKg: true, pecas: true, desenhoProjetoMarca: true, descricao: true,
    },
    orderBy: { data: "asc" },
  });

  const porSetor = Object.fromEntries(SETORES_RETRABALHO.map((s) => [s.id, arr12()]));
  const totalKg = arr12();
  const semSetor = arr12();
  const qtd = arr12();       // quantos apontamentos no mês
  const qtdComPeso = arr12(); // quantos deles têm peso — sem isso, o % engana
  const detalhe = [];

  const somar = (reg) => {
    if (!reg.data) return;
    const m = reg.data.getUTCMonth();
    qtd[m] += 1;
    const kg = reg.kg || 0;
    if (kg > 0) qtdComPeso[m] += 1;
    totalKg[m] += kg;
    if (reg.setor) porSetor[reg.setor][m] += kg;
    else semSetor[m] += kg;
    detalhe.push({ ...reg, mes: m });
  };

  for (const a of aps) {
    somar({
      fonte: "APONTAMENTO", id: a.id, data: a.data, marca: a.desenho, opNumero: a.opNumero,
      setor: setorDaRnc({ setorRetrabalho: a.setor, processoArea: a.setorTexto }),
      kg: pesoDasPecas(a.pecas) ?? a.pesoKg ?? 0, estimado: a.pesoEstimado,
      qtdPecas: a.qtd, descricao: a.descricao, colaborador: a.colaborador,
      numeroRnc: a.numeroRnc, categoria: a.categoria,
    });
  }
  for (const r of rncs) {
    somar({
      fonte: "RNC", id: r.id, data: r.data, marca: r.desenhoProjetoMarca, opNumero: r.opNumero,
      setor: setorDaRnc(r), kg: pesoDasPecas(r.pecas) ?? r.pesoRetrabalhoKg ?? 0,
      descricao: r.descricao, numeroRnc: `${r.numero}/${r.ano}`, categoria: "RETRABALHO",
    });
  }

  const serie = Object.fromEntries(
    SETORES_RETRABALHO.map((s) => [s.id, producao.map((p, m) => pct(porSetor[s.id][m], p))]),
  );
  return {
    producao, porSetor, serie, totalKg, semSetor, qtd, qtdComPeso,
    total: producao.map((p, m) => pct(totalKg[m], p)),
    registros: detalhe,
  };
}

/** A série de um processo inteiro (soma dos setores dele) — é o que vai ao indicador da Engenharia. */
export function serieDoProcesso(dados, processo) {
  const ids = SETORES_RETRABALHO.filter((s) => s.processo === processo).map((s) => s.id);
  const kg = arr12();
  for (const id of ids) dados.porSetor[id].forEach((v, m) => { kg[m] += v; });
  return { kg, serie: dados.producao.map((p, m) => pct(kg[m], p)) };
}
