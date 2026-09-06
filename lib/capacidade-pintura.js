// ─── A META DA PINTURA ─────────────────────────────────
//
// ⚠⚠ 280 TONELADAS/MÊS, a mesma meta de entrega da fábrica. Tudo que embarca passa aqui: a pintura
// é a última porta antes da expedição, e Vitor (06/09/2026) definiu que "após passar pela pintura
// essas peças não devem nem aparecer em fila alguma mais". Não há bypass como o das marcas avulsas
// em montagem e solda, então a meta é a de entrega, sem desconto.
//
// ⚠⚠ POR QUE NÃO CALIBREI ISTO CONTRA O SYNECO, ao contrário do que fiz na solda, no acabamento e
// no jato. Porque o dado da pintura não serve para medir ritmo: em 90 dias há apenas 27 dias com
// apontamento, e um deles marca 63.191 kg — mais de duas vezes a meta diária. Isso é fechamento de
// ordem em LOTE, não produção diária. A média de 13.896 kg/dia que sai daí é um artefato do jeito
// de apontar, não a velocidade do setor.
//
// Consequência prática: a régua abaixo é a META, e não existe "ritmo medido" honesto para comparar
// como existe nos outros setores. Quando a pintura passar a apontar dia a dia, é aqui que se
// acerta — num lugar só.

/** Meta de entrega da fábrica, em kg por mês. Igual à do acabamento: tudo que embarca é pintado. */
export const META_KG_MES_PINTURA = 280000;

/** Dias úteis considerados no mês. 21 é a base usada em todas as metas do portal. */
export const DIAS_UTEIS_MES = 21;

/** Meta diária da pintura, em kg. */
export const META_KG_DIA_PINTURA = Math.round(META_KG_MES_PINTURA / DIAS_UTEIS_MES);

// ─── A DEMÃO É TEMPO DE CALENDÁRIO, NÃO DE TRABALHO ────
//
// ⚠⚠ Vitor (06/09/2026): "temos alguns tipos de pintura, sendo elas 1 demão, 2 demão, 3 demão, e
// quanto mais demão mais tempo vamos levar para finalizar, e esse tempo é importante demais".
//
// A armadilha é achar que três demãos é o triplo do trabalho. Não é: entre uma demão e a seguinte
// a peça SECA, e enquanto seca ela ocupa o galpão sem consumir mão de obra. O PLP da OP-094 traz
// `secagem: "8 horas"` em cada demão — ou seja, na prática uma demão por dia por peça.
//
// Então o prazo de um lote é a soma de duas coisas de naturezas diferentes:
//
//     dias = teto(kg ÷ meta diária)   ← quanto trabalho tem (escala com o tamanho do lote)
//          + (demãos − 1)             ← quanto tempo espera secando (NÃO escala com o lote)
//
// Um lote de 3 demãos leva no mínimo 3 dias mesmo que caiba folgado num dia de capacidade. É esse
// piso que o Gantt precisa mostrar, e é ele que hoje não aparece em lugar nenhum do portal.

/** Horas de secagem entre demãos quando o PLP não disser outra coisa. Base: PLP da OP-094. */
export const SECAGEM_HORAS_PADRAO = 8;

/**
 * Número de demãos de uma OP, lido do PLP.
 *
 * ⚠ SEM PLP NÃO SE CHUTA PARA CIMA. Devolve 1 e marca `semPlp`, para a tela poder avisar em vez de
 * inventar um prazo. Medido em 06/09/2026: das OPs na fila da pintura, só a 067 tinha PLP.
 *
 * @param {{demaos?: unknown} | null | undefined} plano registro de PlanoPintura da OP
 * @returns {{demaos: number, semPlp: boolean}}
 */
export function demaosDoPlano(plano) {
  const lista = plano && Array.isArray(plano.demaos) ? plano.demaos : null;
  if (!lista || lista.length === 0) return { demaos: 1, semPlp: true };
  return { demaos: lista.length, semPlp: false };
}

/**
 * Quantos dias de galpão um lote ocupa, contando a secagem entre demãos.
 *
 * @param {number} kg peso do lote
 * @param {number} [demaos] número de demãos do PLP; 1 quando não houver
 * @param {number} [kgDia] régua a usar; padrão é a meta
 * @returns {number} dias corridos de ocupação do galpão
 */
export function diasDePintura(kg, demaos = 1, kgDia = META_KG_DIA_PINTURA) {
  const k = Number(kg) || 0;
  const r = Number(kgDia) || META_KG_DIA_PINTURA;
  const d = Math.max(1, Math.round(Number(demaos) || 1));
  const trabalho = r > 0 ? Math.ceil(k / r) : 0;
  return Math.max(d, trabalho + (d - 1));
}
