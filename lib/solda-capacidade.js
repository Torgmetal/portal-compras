// ─── A RÉGUA DA SOLDA ─────────────────────────────────────────────────────────
// Espelha lib/montagem-capacidade.js: reparte conjuntos entre bancadas pelo custo REAL de cada
// peça, e não pela contagem. Medido em 1.135 dias×bancada de 12 meses de apontamento do Syneco.
//
// ⚠⚠ SOLDA SE MEDE EM PEÇA POR FAIXA DE PESO, NUNCA EM kg — mesma armadilha da montagem, e aqui é
// pior: 58% das peças pesam ≤25 kg e valem 6% dos quilos; 6% pesam >300 kg e valem 51%. Repartir
// por quantidade de peça enche uma bancada de trabalho e esvazia a outra.
//
// ⚠ POR QUE A SOLDA É MAIS LENTA QUE A MONTAGEM, e cada vez mais conforme a peça engorda
// (razão solda/montagem por faixa: 0,86 · 0,80 · 0,69 · 0,36 · 0,40): montar é posicionar e
// pontear, soldar é correr cordão. Pontear uma peça de 500 kg não dá muito mais trabalho que uma de
// 100 — mas o cordão cresce com a peça. Vitor perguntou como podia haver diferença tão grande se a
// solda solda o que a montagem monta; o mix é o MESMO (mediana 50 kg/peça na montagem, 52 na
// solda) — o que muda é o trabalho por peça.

// Faixas em kg POR PEÇA (pesoTotalKg / qte), não por marca.
export const FAIXAS_KG = [25, 60, 120, 300, Infinity];

// Mediana dos dias "puros" (≥80% das peças do dia na mesma faixa). É o que a solda faz num dia
// comum — serve para enxergar, não para planejar.
export const RITMO_NORMAL = [
  { ate: 25, pecasDia: 25 }, { ate: 60, pecasDia: 5 }, { ate: 120, pecasDia: 3 },
  { ate: 300, pecasDia: 3 }, { ate: Infinity, pecasDia: 1 },
];

// p75 dos mesmos dias: o que a solda já faz em 1 de cada 4 dias. Rende ~918 kg por bancada-dia,
// ou ~116 t/mês com 6 bancadas — que é praticamente o que a fábrica entregou nos últimos 12 meses
// (mediana real 105 t/mês). Ou seja: NÃO é esticada, é o retrato.
export const RITMO_META = [
  { ate: 25, pecasDia: 53 }, { ate: 60, pecasDia: 10 }, { ate: 120, pecasDia: 8 },
  { ate: 300, pecasDia: 5 }, { ate: Infinity, pecasDia: 2 },
];

// ⚠⚠ META DE GUERRA — 200 t/mês. Vitor (01/09/2026): "não dá, a meta tem que ser acima de 200 ton,
// não tem como ser menos" e "vamos para a guerra, precisa ser o desafio maior para validarmos".
//
// 200 t ÷ 6 bancadas ÷ 21 dias = 1.587 kg por bancada-dia, contra os 918 do p75: fator 1,73. A
// curva inteira é multiplicada por ele, o que preserva a dificuldade RELATIVA entre as faixas (a
// parte que é física) e move só o nível absoluto.
//
// ⚠ O QUE VALIDA O DESAFIO: em NENHUMA faixa o número pedido é inédito — todos ficam abaixo do
// melhor dia já registrado (92 contra 416 · 17 contra 75 · 14 contra 24 · 9 contra 19 · 3,5 contra
// 8). A solda já fez cada um desses ritmos pelo menos uma vez; o desafio é sustentá-los, não
// inventá-los. E 1.587 kg/bancada-dia já foi atingido em 197 dos 1.135 dias medidos (17%).
//
// ⚠ FRACIONÁRIO DE PROPÓSITO. Arredondar para inteiro derruba a meta de 200 para 190 t: a faixa
// >300 vale metade dos quilos, e 3,46 virando 3 tira 10 t do mês sozinho.
export const RITMO_GUERRA = [
  { ate: 25, pecasDia: 91.7 }, { ate: 60, pecasDia: 17.3 }, { ate: 120, pecasDia: 13.8 },
  { ate: 300, pecasDia: 8.65 }, { ate: Infinity, pecasDia: 3.46 },
];

// As 6 bancadas vivas, confirmadas nos últimos 30 dias de apontamento (SOLDA 3, 8, 9 e 10 aparecem
// no histórico mas estão paradas). Vitor (01/09/2026): "tem que ser selecionável de 1 a 6".
export const BANCADAS = ["SOLDA 1", "SOLDA 2", "SOLDA 4", "SOLDA 5", "SOLDA 6", "SOLDA 7"];

// ⚠ O SOLDADOR NÃO É FIXO NA BANCADA — em 30 dias a SOLDA 5 teve quatro soldadores e o Eberton
// passou por cinco bancadas. Vitor pediu para repartir "por soldador"; o Syneco grava a BANCADA e
// a pessoa gira, então repartir por pessoa seria mirar em alvo móvel. Quem senta é do líder.

export function ritmoDaPeca(pesoPeca, curva = RITMO_META) {
  const kg = Number(pesoPeca) || 0;
  return (curva.find((f) => kg <= f.ate) || curva[curva.length - 1]).pecasDia;
}

/** Quanto de uma jornada de bancada o conjunto consome. */
export function custoDoConjunto(c, curva = RITMO_META) {
  const qte = Math.max(1, Number(c?.qte) || 1);
  return qte / ritmoDaPeca((Number(c?.pesoTotalKg) || 0) / qte, curva);
}

/**
 * Reparte os conjuntos entre N bancadas: prioridade primeiro, depois maior custo, sempre na
 * bancada mais livre. Mesma mecânica da montagem — o guloso pelo maior custo é o que impede a
 * bancada de acabar com só peça pesada.
 */
export function repartirPorBancada(conjuntos, nBancadas, opcoes = {}) {
  const curva = opcoes.curva || RITMO_META;
  // ⚠ `opcoes.nomes` manda quando vem: a tela escolhe QUAIS bancadas, não quantas. Vitor
  // (01/09/2026): "e se eu precisar colocar 2 soldadores na mesma obra?" — com só o número, duas
  // bancadas eram sempre a SOLDA 1 e a 2, mesmo com as duas ocupadas e a 4 e a 5 livres.
  const nomes = opcoes.nomes?.length
    ? opcoes.nomes
    : BANCADAS.slice(0, Math.max(1, Math.min(nBancadas, BANCADAS.length)));
  const bancadas = nomes.map((bancada) => ({ bancada, itens: [], custo: 0 }));
  const ordenados = [...(conjuntos || [])].sort((a, b) => {
    const pa = a?.prioridade != null ? 0 : 1, pb = b?.prioridade != null ? 0 : 1;
    return pa - pb || custoDoConjunto(b, curva) - custoDoConjunto(a, curva);
  });
  for (const c of ordenados) {
    const alvo = bancadas.reduce((m, b) => (b.custo < m.custo ? b : m), bancadas[0]);
    const custoDias = custoDoConjunto(c, curva);
    alvo.itens.push({ ...c, custoDias });
    alvo.custo += custoDias;
  }
  return bancadas;
}

/** Espalha o que cada bancada recebeu pelos dias úteis. A janela é consequência, não entrada. */
export function distribuirEmDias(bancadas, inicio) {
  const proximoUtil = (d) => { const x = new Date(d); while (x.getUTCDay() === 0 || x.getUTCDay() === 6) x.setUTCDate(x.getUTCDate() + 1); return x; };
  return (bancadas || []).map((b) => {
    const dias = [];
    let dia = proximoUtil(new Date(`${inicio}T00:00:00Z`)), carga = 0, itens = [];
    for (const it of b.itens) {
      // ⚠ peça que sozinha passa de um dia NÃO é quebrada: ela ocupa o dia inteiro e transborda.
      // Quebrar daria um plano bonito e uma bancada com meia peça soldada no fim do turno.
      if (carga > 0 && carga + it.custoDias > 1.0001) {
        dias.push({ dia: dia.toISOString().slice(0, 10), itens, carga });
        dia = proximoUtil(new Date(dia.getTime() + 86400000)); carga = 0; itens = [];
      }
      itens.push(it); carga += it.custoDias;
      if (carga >= 1) {
        dias.push({ dia: dia.toISOString().slice(0, 10), itens, carga });
        dia = proximoUtil(new Date(dia.getTime() + 86400000)); carga = 0; itens = [];
      }
    }
    if (itens.length) dias.push({ dia: dia.toISOString().slice(0, 10), itens, carga });
    return { bancada: b.bancada, dias, custo: b.custo };
  });
}

/** Próximo dia útil a partir de uma data ISO (pula sábado e domingo). */
export function proximoDiaUtilIso(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Soma N dias ÚTEIS a uma data ISO. */
export function somarDiasUteis(iso, n) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  let faltam = Math.max(0, Math.ceil(n));
  while (faltam > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) faltam--; }
  return d.toISOString().slice(0, 10);
}

/**
 * Quanto trabalho ainda pendura em cada bancada e a partir de quando ela vaga.
 *
 * ⚠⚠ MEDE O QUE ESTÁ GRAVADO E AINDA NÃO FOI SOLDADO, não o que já foi. Vitor (01/09/2026): "a
 * bancada que eu já selecionei não deve permitir eu selecionar ela também, até que eu selecione uma
 * data posterior ao prazo que de fato ele vai levar". O "de fato" é isto: a carga que sobrou lá,
 * convertida em dias pelo ritmo escolhido — não uma data que alguém digitou.
 *
 * ⚠ Conta a partir de HOJE, não da data em que a bancada foi atribuída: bancada carregada ontem e
 * não tocada continua ocupando o dia de hoje.
 * @returns {Record<string,{conj:number,un:number,kg:number,dias:number,livreEm:string}>}
 */
export function ocupacaoDasBancadas(itensComBancada, hojeIso, curva = RITMO_META) {
  const hoje = proximoDiaUtilIso(hojeIso);
  const m = {};
  for (const c of itensComBancada || []) {
    const b = c?.soldaBancada;
    if (!b) continue;
    (m[b] ??= { conj: 0, un: 0, kg: 0, dias: 0, livreEm: hoje });
    m[b].conj++;
    m[b].un += Math.max(1, Number(c.qte) || 1);
    m[b].kg += Number(c.pesoTotalKg) || 0;
    m[b].dias += custoDoConjunto(c, curva);
  }
  for (const v of Object.values(m)) {
    v.dias = Number(v.dias.toFixed(2));
    // vaga no dia útil seguinte ao último dia de trabalho; carga abaixo de um dia ainda toma hoje
    v.livreEm = somarDiasUteis(hoje, Math.max(1, Math.ceil(v.dias)));
  }
  return m;
}
