// ─── QUANTO UMA BANCADA DE MONTAGEM DÁ CONTA POR DIA ──────────────────────────
// Medido nos apontamentos do Syneco (setor Montagem, desde 01/03/2026, 478 dias-bancada).
//
// ⚠⚠ NÃO SE MEDE MONTAGEM EM KG. Vitor (01/09/2026): "vamos ter que prever em peças, pois isso não
// vai fechar". O dado deu razão a ele de forma gritante: entre março e agosto as mesmas duas
// bancadas mantiveram 35 → 36,6 PEÇAS por dia enquanto o kg/dia caía de 4.312 para 1.425 — porque o
// peso médio da peça caiu de 123 kg para 39 kg. Quem planeja em tonelada acha que a fábrica parou
// quando na verdade ela fez o mesmo trabalho com peça menor.
//
// ⚠ MAS TAMBÉM NÃO É SÓ CONTAR PEÇA: o ritmo cai com o peso (36/dia nas miúdas, 4/dia acima de
// 300 kg). Por isso a régua é PEÇAS POR FAIXA DE PESO, e o custo de um lote sai em "dias-bancada".
//
// ⚠⚠ ONDE ISSO MUDA A DECISÃO: na OP-112, os 25 conjuntos de até 25 kg são 12% do peso e 52% do
// trabalho; os 6 acima de 300 kg são 36% do peso e 18% do trabalho. Repartir por tonelada entrega
// a obra na mão errada.
//
// ⚠ NÚMEROS DE CONFIGURAÇÃO, não constantes do negócio. A fábrica muda — gente, gabarito, tipo de
// obra — e estes valores têm de poder ser ajustados sem mexer no resto do código.

/** Ritmo NORMAL: a mediana dos dias-bancada observados. É o piso realista. */
export const RITMO_NORMAL = [
  { ate: 25, pecasDia: 36 },
  { ate: 60, pecasDia: 11 },
  { ate: 120, pecasDia: 11 },
  { ate: 300, pecasDia: 8 },
  { ate: Infinity, pecasDia: 4 },
];

/**
 * Ritmo META: o percentil 75 do que a bancada JÁ FEZ — o ritmo que ela atinge um dia em cada
 * quatro. Vitor (01/09/2026): "precisa ser mais do que esse número que vc informou".
 *
 * ⚠ NÃO É O RECORDE. O melhor dia de cada faixa (234 peças nas miúdas, 249 na de 60–120) é fora da
 * curva e serviria só para desmoralizar a meta. O p75 é exigente e já foi batido dezenas de vezes.
 */
export const RITMO_META = [
  { ate: 25, pecasDia: 78 },
  { ate: 60, pecasDia: 18 },
  { ate: 120, pecasDia: 17 },
  { ate: 300, pecasDia: 13 },
  { ate: Infinity, pecasDia: 7 },
];

/** As bancadas de montagem, com o nome que o Syneco aponta. */
export const BANCADAS = ["MONTAGEM 1", "MONTAGEM 2", "MONTAGEM 3", "MONTAGEM 4", "MONTAGEM 5"];

export const ritmoDaPeca = (kgUnit, curva = RITMO_NORMAL) =>
  (curva.find((f) => (Number(kgUnit) || 0) <= f.ate) || curva[curva.length - 1]).pecasDia;

/**
 * Quanto de uma bancada-dia este conjunto consome.
 * ⚠ o peso que manda é o da UNIDADE, não o total da marca: 10 peças de 20 kg (200 kg) andam no
 * ritmo das miúdas, não no de uma peça de 200 kg.
 */
export function custoDoConjunto(c, curva = RITMO_NORMAL) {
  const qte = Math.max(1, Number(c?.qte) || 1);
  // ⚠⚠ O CUSTO É DO QUE FALTA. Mesmo ajuste feito na solda (Vitor, 01/09/2026): conjunto com 4
  // peças e 3 prontas custava as 4, e o prazo esticava. Onde o chamador informar `qtePendente`,
  // é ele que manda; sem o campo, nada muda.
  // ⚠ O peso por peça continua saindo da quantidade CHEIA — `pesoTotalKg` é o peso das `qte`
  // peças, e dividir pelo pendente inflaria a peça para uma faixa mais pesada.
  const kgUnit = (Number(c?.pesoTotalKg) || 0) / qte;
  const pend = c?.qtePendente != null ? Math.max(0, Number(c.qtePendente) || 0) : qte;
  return pend / ritmoDaPeca(kgUnit, curva);
}

/**
 * Reparte os conjuntos entre N bancadas, equilibrando DIAS-BANCADA.
 *
 * ⚠⚠ EQUILIBRA TRABALHO, NÃO PESO NEM CONTAGEM. Dividir a OP-112 "metade do peso para cada" põe
 * 245 peças miúdas numa bancada (6,8 dias) e 45 peças graúdas na outra (6,2) — empata por acaso.
 * Dividir "metade das peças" põe uma para terminar em 3,4 dias e a outra em 9. Só dias-bancada
 * fecha, e é a conta que a fábrica sente.
 *
 * ⚠ PRIORIDADE ENTRA PRIMEIRO. Vitor (01/09/2026): "pode ser que tenhamos alguns conjuntos que
 * serão prioridade, ou seja precisa entrar na fila primeiro". Conjunto marcado é distribuído antes
 * de todo o resto e fica no topo da fila da sua bancada — senão "prioridade" seria só um rótulo.
 *
 * ⚠ DEPOIS DA PRIORIDADE, O MAIOR PRIMEIRO. Distribuir na ordem natural deixa o último conjunto
 * grande sem par e desequilibra o fim; começando pelos caros, os pequenos preenchem as folgas.
 *
 * @param {{id,marca,qte,pesoTotalKg,prioridade}[]} conjuntos
 * @param {number} nBancadas 1..5
 * @param {{curva?: object[], nomes?: string[]}} [opcoes]
 * @returns {{bancada,itens,un,kg,dias}[]}
 */
export function repartirPorBancada(conjuntos, nBancadas, opcoes = {}) {
  const curva = opcoes.curva || RITMO_NORMAL;
  const nomes = opcoes.nomes || BANCADAS;
  const n = Math.max(1, Math.min(nomes.length, Number(nBancadas) || 1));
  const bancadas = Array.from({ length: n }, (_, i) => ({ bancada: nomes[i], itens: [], un: 0, kg: 0, dias: 0 }));
  if (!Array.isArray(conjuntos) || !conjuntos.length) return bancadas;

  const comCusto = conjuntos.map((c) => ({ c, custo: custoDoConjunto(c, curva) }));
  comCusto.sort((a, b) => {
    const pa = a.c.prioridade != null, pb = b.c.prioridade != null;
    if (pa !== pb) return pa ? -1 : 1;                                  // marcadas primeiro
    if (pa && pb && a.c.prioridade !== b.c.prioridade) return a.c.prioridade - b.c.prioridade;
    return b.custo - a.custo;                                          // depois o mais caro
  });

  for (const { c, custo } of comCusto) {
    // ⚠ a menos carregada AGORA; empate vai para a de índice menor, para o resultado ser estável
    const alvo = bancadas.reduce((m, b) => (b.dias < m.dias - 1e-9 ? b : m), bancadas[0]);
    alvo.itens.push({ ...c, custoDias: custo });
    alvo.un += Math.max(1, Number(c.qte) || 1);
    alvo.kg += Number(c.pesoTotalKg) || 0;
    alvo.dias += custo;
  }
  return bancadas;
}

/** Resumo do lote: dias-bancada total e a duração com N bancadas, nas duas réguas. */
export function resumoDoLote(conjuntos, nBancadas) {
  const dNormal = (conjuntos || []).reduce((s, c) => s + custoDoConjunto(c, RITMO_NORMAL), 0);
  const dMeta = (conjuntos || []).reduce((s, c) => s + custoDoConjunto(c, RITMO_META), 0);
  const n = Math.max(1, Number(nBancadas) || 1);
  return {
    diasBancadaNormal: dNormal, diasBancadaMeta: dMeta,
    diasNormal: dNormal / n, diasMeta: dMeta / n,
    un: (conjuntos || []).reduce((s, c) => s + Math.max(1, Number(c.qte) || 1), 0),
    kg: (conjuntos || []).reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0),
  };
}

/**
 * Espalha o que cada bancada recebeu pelos DIAS, a partir de uma data de início.
 *
 * Vitor (01/09/2026): "minha intenção não é programar um único dia, ela poderia muito bem já estar
 * programando a montagem de dias para frente".
 *
 * ⚠⚠ AQUI A JANELA É CONSEQUÊNCIA, NÃO ENTRADA — o contrário do corte. No corte o PCP dá início e
 * fim e o portal reparte o lote dentro; na montagem quem manda é a capacidade da bancada: dado o
 * dia de começo e quantas bancadas, o fim é o que a conta devolver. Pedir a janela aqui deixaria a
 * Larissa escolher uma data de fim que a fábrica não alcança — e o plano nasceria falso.
 *
 * ⚠ UM CONJUNTO NÃO SE PARTE ENTRE DOIS DIAS na conta: ele começa e termina no dia em que coube.
 * Um conjunto que sozinho custa mais de um dia (peça acima de 300 kg, por exemplo) ocupa o dia
 * inteiro e empurra o resto — que é o que acontece no chão.
 *
 * ⚠ SÓ DIA ÚTIL. A grade da fábrica é seg–sex, como no PMP e na fila de corte.
 *
 * @param {{bancada,itens}[]} bancadas saída de repartirPorBancada
 * @param {Date} inicio primeiro dia possível
 * @returns {{bancada, dias: {dia: Date, itens: [], un, kg, carga}[] }[]}
 */
export function distribuirEmDias(bancadas, inicio) {
  const dia0 = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
  const ehUtil = (d) => { const w = d.getUTCDay(); return w >= 1 && w <= 5; };
  const primeiro = dia0(inicio);
  while (!ehUtil(primeiro)) primeiro.setUTCDate(primeiro.getUTCDate() + 1);

  return (bancadas || []).map((b) => {
    const dias = [];
    let atual = new Date(primeiro);
    let carga = 0;
    const abrir = () => { dias.push({ dia: new Date(atual), itens: [], un: 0, kg: 0, carga: 0 }); return dias[dias.length - 1]; };
    let hoje = abrir();
    for (const it of b.itens || []) {
      const custo = it.custoDias ?? custoDoConjunto(it);
      // vira o dia quando o que já está lá encheria a jornada — mas nunca deixa dia vazio
      if (carga > 0 && carga + custo > 1.0000001) {
        do { atual.setUTCDate(atual.getUTCDate() + 1); } while (!ehUtil(atual));
        hoje = abrir();
        carga = 0;
      }
      hoje.itens.push(it);
      hoje.un += Math.max(1, Number(it.qte) || 1);
      hoje.kg += Number(it.pesoTotalKg) || 0;
      hoje.carga += custo;
      carga += custo;
    }
    return { bancada: b.bancada, dias: dias.filter((d) => d.itens.length) };
  });
}

/** O último dia de todas as bancadas — a data em que a obra fecha nesse plano. */
export function ultimoDia(porDia) {
  let max = null;
  for (const b of porDia || []) for (const d of b.dias || []) {
    if (!max || d.dia > max) max = d.dia;
  }
  return max;
}
