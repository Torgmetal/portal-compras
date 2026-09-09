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

// ⚠ "PEÇAS COMPLEXAS" (Vitor, 01/09/2026). É a mediana dos dias "puros" (≥80% das peças do dia na
// mesma faixa) — o ritmo do dia comum medido. O nome mudou porque o uso mudou: não serve como plano
// geral (é lento demais para virar meta), mas é o número honesto quando o lote é difícil de soldar,
// e aí planejar pelo ritmo médio é o que estoura o prazo.
export const RITMO_COMPLEXAS = [
  { ate: 25, pecasDia: 25 }, { ate: 60, pecasDia: 5 }, { ate: 120, pecasDia: 3 },
  { ate: 300, pecasDia: 3 }, { ate: Infinity, pecasDia: 1 },
];

// ⚠ "CONSERVADOR" (Vitor, 01/09/2026). p75 dos mesmos dias: o que a solda já faz em 1 de cada 4.
// Rende ~918 kg por bancada-dia, ou ~116 t/mês com 6 bancadas — praticamente o que a fábrica
// entregou nos últimos 12 meses (mediana real 105 t/mês). É o retrato, não uma esticada; por isso
// deixou de se chamar "meta" quando a meta de verdade passou a ser 200 t.
export const RITMO_CONSERVADOR = [
  { ate: 25, pecasDia: 53 }, { ate: 60, pecasDia: 10 }, { ate: 120, pecasDia: 8 },
  { ate: 300, pecasDia: 5 }, { ate: Infinity, pecasDia: 2 },
];

// ⚠⚠ META — 230 t/mês. Vitor (06/09/2026): "montagem e solda pode ser 230 por conta das marcas".
// Antes era 200 t (01/09: "a meta tem que ser acima de 200 ton, não tem como ser menos").
//
// ⚠⚠ POR QUE A SOLDA PODE SER MENOR QUE A ENTREGA. A meta de ENTREGA da fábrica é 280 t/mês, e a
// solda fica em 230 porque **25% do peso não passa por aqui**: são marcas avulsas, que saem do
// corte direto para o acabamento sem ver bancada. Medido em 06/09/2026 nas cinco OPs vivas: das
// 89.761 t que chegam ao acabamento, 22.139 (25%) nunca tiveram ordem de montagem. O funil estreita
// na montagem e REABRE no acabamento — e é por isso que os três números são diferentes.
//
// ⚠⚠ A META EM TONELADA DEPENDE DA MISTURA, e isto quase passou batido. A calibragem de 01/09 usou
// a base histórica: 200 t ÷ 6 bancadas ÷ 21 dias = 1.587 kg/bancada-dia, fator 1,73 sobre os 918 do
// p75. Só que com a mistura das obras de HOJE a mesma curva rende 1.317 kg/bancada-dia — ou seja,
// a "meta de 200 t" estava entregando 166. Não é bug: é mais peça leve, a bancada faz o mesmo
// TRABALHO e menos QUILO. A mesma armadilha que o cabeçalho de montagem-capacidade descreve, só que
// mordendo a meta em vez da medição.
//
// Vitor (06/09/2026) escolheu ancorar na mistura de HOJE: "vamos para o número de hoje, precisamos
// entregar mais". Então o fator saiu de 1,73 para **1,39 sobre a meta anterior** (2,41 sobre o p75),
// calibrado para 230 t com os 427 conjuntos que estão na fábrica agora.
//
// ⚠ O QUE ISSO CUSTA, e foi combinado: em mês de peça miúda a fábrica entrega MENOS tonelada
// fazendo o mesmo trabalho. A meta ancorada no mix de hoje não é estável — se a próxima obra for de
// peça graúda, a mesma curva entrega mais. Quem cobrar o número precisa saber disso.
//
// A curva inteira é multiplicada pelo fator, o que preserva a dificuldade RELATIVA entre as faixas
// (a parte que é física) e move só o nível absoluto.
//
// ⚠ O QUE VALIDA O DESAFIO: em NENHUMA faixa o número pedido é inédito — todos seguem abaixo do
// melhor dia já registrado (127 contra 416 · 24 contra 75 · 19 contra 24 · 12 contra 19 · 4,8
// contra 8). A solda já fez cada um desses ritmos pelo menos uma vez; o desafio é sustentá-los.
//
// ⚠ MAS A FAIXA DE 60–120 kg FICOU APERTADA: 19,2 pedidos contra 24 do melhor dia é 80% do recorde,
// bem mais justo que as outras. Se a meta começar a falhar, é o primeiro lugar para olhar — e o
// primeiro candidato a ajuste se a mistura mudar.
//
// ⚠ FRACIONÁRIO DE PROPÓSITO. Arredondar para inteiro derruba a meta de 200 para 190 t: a faixa
// >300 vale metade dos quilos, e 3,46 virando 3 tira 10 t do mês sozinho.
export const RITMO_META = [
  { ate: 25, pecasDia: 127.5 }, { ate: 60, pecasDia: 24.0 }, { ate: 120, pecasDia: 19.2 },
  { ate: 300, pecasDia: 12.0 }, { ate: Infinity, pecasDia: 4.81 },
];

// As 7 bancadas vivas. Eram 6 até 09/09/2026, quando a SOLDA 9 entrou: ela tem 106 apontamentos
// nos últimos 90 dias (45% do Eberton) e estava fora só porque a janela de conferência era de 30
// dias. SOLDA 3, 8 e 10 seguem paradas — 3, 4 e 7 apontamentos no mesmo período.
export const BANCADAS = ["SOLDA 1", "SOLDA 2", "SOLDA 4", "SOLDA 5", "SOLDA 6", "SOLDA 7", "SOLDA 9"];

/* ⚠⚠ A BANCADA TEM NOME DE GENTE. Vitor (09/09/2026): "nas bancadas da solda coloque o nome dos
   operadores no lugar de solda 1, 2, 3". Mesma decisão já tomada na montagem, e pela mesma razão:
   quem programa fala em pessoa.

   ⚠⚠ A CHAVE NÃO MUDA — o rótulo, sim. "SOLDA 1" é o que o Syneco aponta e o que está gravado em
   `PecaConjunto.soldaBancada`. Trocar a chave apagaria a atribuição de todas as peças e faria o
   portal deixar de casar com o apontamento da fábrica.

   ⚠ O MAPA É MEDIDO, não escolhido: 90 dias de apontamento, 1.852 registros. Diego 99% da 1, Daniel
   93% da 2, Vando 96% da 4, Wilson 93% do tempo dele na 5, Eberton 45% da 9, Christhian 38% da 7.
   A 6 é a mais fraca das sete (Édecio tem 40% do pouco que aponta), e foi decisão do Vitor pôr o
   nome dele ali mesmo assim.

   ⚠ A 5 ERA COMPARTILHADA — Wilson 45% e Eberton 44%. Vitor (09/09/2026): "pode ignorar e colocar
   bancadas separadas". Daí a 9 entrar: o Eberton ganha a dele em vez de dividir o rótulo.

   ⚠ REINNAN BENEDITO DA SILVA veio na lista e NÃO entra: o cadastro o tem em Montagem Externa, com
   zero apontamento de bancada em 90 dias. É soldador de campo — pôr o nome dele numa bancada da
   fábrica atribuiria a ele trabalho que é de outro. Vitor confirmou: "Vando na 4, Reinnan fora".

   ⚠ O soldador não é fixo na bancada: a 5 teve quatro soldadores em 30 dias e o Eberton passou por
   cinco. O nome aqui diz DE QUEM É A BANCADA, não quem soldou aquela peça — quem soldou está no
   apontamento do Syneco, e é de lá que sai qualquer conta por pessoa. */
export const SOLDADOR_DA_BANCADA = {
  "SOLDA 1": "Diego Rivelino",
  "SOLDA 2": "Daniel da Silva",
  "SOLDA 4": "Vando Máximo",
  "SOLDA 5": "Wilson Barros",
  "SOLDA 6": "Édecio Viana",
  "SOLDA 7": "Christhian Moreira",
  "SOLDA 9": "Eberton Rogério",
};

/** O rótulo da bancada na tela: o nome de quem senta nela, ou a própria chave se ninguém foi dito. */
export const nomeDaBancada = (b) => SOLDADOR_DA_BANCADA[String(b || "").trim().toUpperCase()] || b || "sem bancada";

export function ritmoDaPeca(pesoPeca, curva = RITMO_CONSERVADOR) {
  const kg = Number(pesoPeca) || 0;
  return (curva.find((f) => kg <= f.ate) || curva[curva.length - 1]).pecasDia;
}

/** Quanto de uma jornada de bancada o conjunto consome. */
export function custoDoConjunto(c, curva = RITMO_CONSERVADOR) {
  const qte = Math.max(1, Number(c?.qte) || 1);
  // ⚠⚠ O CUSTO É DO QUE FALTA, NÃO DO CONJUNTO INTEIRO. Vitor (01/09/2026): "no cálculo do dia você
  // não está considerando as quantidades parciais — no caso da 103 temos um conjunto que tem 4
  // peças e 3 já feitas, então o prazo se estica demais".
  //
  // Caso real: a marca 71811869 tem 4 peças de 1.258 kg, 3 já soldadas. Cobrada inteira custava
  // 1,16 dia-bancada; o que falta custa 0,29. Só a OP-103 aparecia com 126% de trabalho a mais do
  // que tem, e a folha mandava o soldador refazer peça pronta.
  //
  // ⚠ O PESO POR PEÇA CONTINUA SAINDO DA QUANTIDADE CHEIA: `pesoTotalKg` é o peso das `qte` peças,
  // então dividir pelo pendente inflaria a peça e a jogaria numa faixa mais pesada — o erro
  // trocaria de lugar em vez de sumir.
  const pesoPeca = (Number(c?.pesoTotalKg) || 0) / qte;
  const pend = c?.qtePendente != null ? Math.max(0, Number(c.qtePendente) || 0) : qte;
  return pend / ritmoDaPeca(pesoPeca, curva);
}

/**
 * Reparte os conjuntos entre N bancadas: prioridade primeiro, depois maior custo, sempre na
 * bancada mais livre. Mesma mecânica da montagem — o guloso pelo maior custo é o que impede a
 * bancada de acabar com só peça pesada.
 */
export function repartirPorBancada(conjuntos, nBancadas, opcoes = {}) {
  const curva = opcoes.curva || RITMO_CONSERVADOR;
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
export function ocupacaoDasBancadas(itensComBancada, hojeIso, curva = RITMO_CONSERVADOR) {
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
