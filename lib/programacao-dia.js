// ─── O DIA DE CADA PEÇA DENTRO DA PROGRAMAÇÃO ─────────────────────────────────
// Vitor (01/09/2026): "quando eu fizer uma programação para mais de um dia precisamos ter a visão
// separada no pcp para ficar registrado para quais dias foram programados tais peças, e na situação
// aquilo que não foi executado na data programada ficar em vermelho e deixar de alguma forma levar
// para a data próxima para a execução".
//
// Até aqui a programação gravava só a JANELA (início→fim), igual para todas as peças; quem repartia
// por dia era o PMP, e só em kg agregado por OP. A peça não sabia de que dia ela era — então não
// havia como dizer "esta não foi feita no dia dela", que é a pergunta que a tela precisa responder.
//
// Sem dependência de banco de propósito: é a regra que decide o que a fábrica corta em cada dia, e
// regra assim tem de poder ser conferida fora do servidor.

const dia0 = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
export const isoDia = (d) => dia0(d).toISOString().split("T")[0];
const ehUtil = (d) => { const w = dia0(d).getUTCDay(); return w >= 1 && w <= 5; };

/** Próximo dia útil DEPOIS de `d` (sexta → segunda). */
export function proximoDiaUtil(d) {
  const x = dia0(d);
  do { x.setUTCDate(x.getUTCDate() + 1); } while (!ehUtil(x));
  return x;
}

/** Dias úteis (seg–sex) de `inicio` a `fim`, inclusive. Janela só de fim de semana → segunda seguinte. */
export function diasUteisDaJanela(inicio, fim) {
  const dias = [];
  for (const d = dia0(inicio); d <= dia0(fim); d.setUTCDate(d.getUTCDate() + 1)) {
    if (ehUtil(d)) dias.push(new Date(d));
  }
  return dias.length ? dias : [proximoDiaUtil(fim)];
}

/**
 * Menor carga máxima possível para partir `pesos` em até `k` blocos SEGUIDOS.
 * Busca binária sobre a capacidade — é o "split array largest sum" clássico, e dá o ótimo exato.
 */
function capacidadeMinima(pesos, k) {
  let lo = Math.max(0, ...pesos);
  let hi = pesos.reduce((a, b) => a + b, 0);
  const cabe = (c) => {
    let blocos = 1, acum = 0;
    for (const w of pesos) {
      if (acum + w > c && acum > 0) { blocos++; acum = w; } else acum += w;
    }
    return blocos <= k;
  };
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (cabe(mid)) hi = mid; else lo = mid + 1;
  }
  return lo;
}

/**
 * Reparte as peças pelos dias úteis da janela, em BLOCOS CONTÍGUOS na ordem da fila.
 *
 * ⚠⚠ BLOCO CONTÍGUO, NÃO RODÍZIO. A fila tem ordem (`corteOrdem`) e a fábrica corta nela; espalhar
 * peça sim, peça não pelos dias embaralharia a sequência que o PCP montou — e obrigaria a máquina a
 * trocar de perfil a cada peça. Cada dia recebe uma fatia seguida da fila.
 *
 * ⚠ O EQUILÍBRIO É POR PESO, não por número de peças. Um dia com 40 cantoneiras e outro com 40
 * chapas de 19 não são a mesma carga, e é em kg que a meta do corte é medida.
 *
 * ⚠⚠ A COTA É CALCULADA, NÃO É peso/dias. A primeira versão enchia o dia até passar da média e só
 * então virava — com peso irregular (uma peça de 3,2 t no meio de cantoneiras) isso dava 106% de
 * desvio entre o dia mais leve e o mais pesado, e um dia inteiro com UMA peça. Buscando a menor
 * carga máxima que ainda cabe nos dias, o mesmo lote fica em 58%; o que sobra é irredutível — uma
 * peça que sozinha vale 64% da cota do dia não tem como ser dividida.
 *
 * ⚠ NENHUM DIA FICA VAZIO havendo peça para ele: dia em branco na grade parece folga onde não há.
 *
 * @param {{id:string, pesoTotalKg?:number}[]} pecas já na ordem da fila
 * @param {Date[]} dias dias úteis da janela
 * @returns {Map<string, Date>} id da peça → dia
 */
export function repartirPorDia(pecas, dias) {
  const mapa = new Map();
  if (!pecas?.length || !dias?.length) return mapa;
  // ⚠ SEM PESO, REPARTE POR QUANTIDADE. Peça com `pesoTotalKg` nulo existe (LPC incompleta), e com
  // o lote inteiro zerado a cota daria 0 — todas as peças caíam no primeiro dia e os outros ficavam
  // em branco. Peso 1 para todas transforma a mesma conta em divisão por número de peças.
  const brutos = pecas.map((p) => Number(p.pesoTotalKg) || 0);
  const pesos = brutos.some((w) => w > 0) ? brutos : pecas.map(() => 1);
  const cota = capacidadeMinima(pesos, dias.length);

  let dia = 0, acum = 0;
  pecas.forEach((p, i) => {
    const w = pesos[i];
    const restamPecas = pecas.length - i;   // esta inclusive
    const restamDias = dias.length - dia;   // o atual inclusive
    if (dia < dias.length - 1 && acum > 0 && (acum + w > cota || restamPecas <= restamDias - 1)) {
      dia++; acum = 0;
    }
    mapa.set(p.id, dias[dia]);
    acum += w;
  });
  return mapa;
}

/**
 * A peça está atrasada? Dia programado já passou e ela não foi cortada.
 * ⚠ Compara só o DIA: peça do dia de hoje não é atrasada às 8h da manhã.
 */
export function atrasadaNoDia(dia, hojeIso) {
  if (!dia) return false;
  return isoDia(dia) < (hojeIso || isoDia(new Date()));
}
