// ENSAIO POR ULTRASSOM — o que a tela pede e o que o portal calcula.
//
// Tudo aqui sai do PI-QUA-003 Rev.1 (set/2020) — "Ensaios de Ultrassom conforme AWS D1.1", da
// QUALINSP. Vitor apontou o procedimento; as listas e as fórmulas são dele, não escolha minha.
//
// ⚠ SÓ A DESCONTINUIDADE REPROVADA É REGISTRADA (item 15.1). A tabela do relatório não é "todas as
// indicações": é o que rejeitou. A exceção é solda designada em contrato como crítica à fratura,
// onde também entram indicações até 6 dB abaixo do nível de rejeição. Isso muda o sentido da folha
// — e é o tipo de coisa que, mal entendida, faz o inspetor lançar dezenas de linhas à toa.

/** Aparelhos aprovados no item 4 do procedimento. Todos pulso-eco. */
export const APARELHOS = [
  "Mitech MDF350B",
  "Krautkramer USN-52",
  "Krautkramer USN-50",
  "Krautkramer USM-25",
  "Krautkramer USM-35",
  "Modsonic-Einstein TFT",
  "GE USM GO",
  "Sonatest Sitescan 150",
];

/** Cabeçotes do item 6.1, com cristal, ângulo e frequência. */
export const CABECOTES = [
  { modelo: "Mitech angular 20x22", angulo: 45, mhz: 2 },
  { modelo: "Mitech angular 20x22", angulo: 60, mhz: 2 },
  { modelo: "Mitech angular 20x22", angulo: 70, mhz: 2 },
  { modelo: "Mitech normal Ø24", angulo: null, mhz: 2 },
  { modelo: "Doppler angular 20x22", angulo: 45, mhz: 2 },
  { modelo: "Doppler angular 20x22", angulo: 60, mhz: 2 },
  { modelo: "Doppler angular 20x22", angulo: 70, mhz: 2 },
  { modelo: "Krautkramer WB45N2", angulo: 45, mhz: 2 },
  { modelo: "Krautkramer WB60N2", angulo: 60, mhz: 2 },
  { modelo: "Krautkramer WB70N2", angulo: 70, mhz: 2 },
  { modelo: "Krautkramer MWB45N4", angulo: 45, mhz: 4 },
  { modelo: "Krautkramer MWB60N4", angulo: 60, mhz: 4 },
  { modelo: "Krautkramer MWB70N4", angulo: 70, mhz: 4 },
  { modelo: "Krautkramer MWK45N4", angulo: 45, mhz: 4 },
  { modelo: "Krautkramer MWK60N4", angulo: 60, mhz: 4 },
  { modelo: "Krautkramer MWK70N4", angulo: 70, mhz: 4 },
];

/** Ângulos usados na varredura (tabela 1 do item 15.1). */
export const ANGULOS = [45, 60, 70];

/** Item 12: "será utilizado metilcelulose dissolvido em água". Lista de um — como o metal base. */
export const ACOPLANTES = ["Metilcelulose em água"];

/** Blocos padrão citados na calibração (item 8). */
export const BLOCOS_PADRAO = ["V1 (IIW)", "V2", "DS", "Bloco de referência conforme AWS D1.1"];

export const FACES = ["A", "B", "C", "D"];

/**
 * Tipo de estrutura — aqui é OBRIGATÓRIO, ao contrário do visual de solda.
 *
 * ⚠ O item 18.1 exige "tipo de estrutura (estaticamente ou dinamicamente carregada)" no conteúdo
 * mínimo do relatório, e o critério muda com ele: item 15.6 para estática, 15.7 para dinâmica. É o
 * mesmo campo que o Vitor mandou tirar do EVS — lá não constava no modelo, aqui o procedimento manda.
 */
export const TIPOS_CARREGAMENTO = [
  { id: "ESTATICA", nome: "Estaticamente carregada", item: "15.6" },
  { id: "DINAMICA", nome: "Dinamicamente carregada", item: "15.7" },
];

/**
 * O FATOR DE ATENUAÇÃO "c" (item 15.3).
 *
 * "obtido subtraindo 1 polegada (25,4 mm) do percurso sônico da descontinuidade e multiplicando por
 * 2 o percurso sônico remanescente (em polegadas). Arredondado para o dB mais próximo; menor que
 * 0,5 para baixo, maior ou igual a 0,5 para cima."
 *
 * ⚠ O percurso entra em MILÍMETROS (é como se mede) e a conta é em POLEGADAS — é aí que se erra
 * fazendo à mão.
 */
export function fatorAtenuacao(percursoMm) {
  const p = Number(percursoMm);
  if (!Number.isFinite(p) || p <= 25.4) return 0;
  const restanteEmPolegadas = (p - 25.4) / 25.4;
  return Math.round(restanteEmPolegadas * 2);
}

/**
 * A CLASSIFICAÇÃO DA INDICAÇÃO "d" (item 15.4): d = a − b − c.
 *
 * ⚠ CALCULADA, NÃO DIGITADA. É o número que decide se a descontinuidade é aceitável, comparado com
 * a tabela do critério. Valor que decide aprovação e é digitado à mão é valor que se erra — mesma
 * razão da média de espessura no relatório de pintura.
 */
export function classificacaoIndicacao({ a, b, percursoMm, c = null }) {
  const na = Number(a), nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return { c: null, d: null };
  const fc = c != null && Number.isFinite(Number(c)) ? Number(c) : fatorAtenuacao(percursoMm);
  return { c: fc, d: +(na - nb - fc).toFixed(1) };
}

/**
 * A tabela de aceitação (itens 15.6 e 15.7) ainda NÃO está cadastrada.
 *
 * ⚠ Vitor (21/08/2026): "os que você não tiver as informações deixe em branco na seleção que vou
 * providenciar posteriormente". As tabelas 2 e 3 do PI-QUA-003 estão como IMAGEM no PDF — não há
 * como lê-las. Enquanto não vierem, o portal calcula o "d" e mostra o valor, mas NÃO diz se passa:
 * quem julga é o inspetor com a tabela impressa na mão.
 *
 * Dizer "aprovado" a partir de uma tabela que eu não tenho seria a pior forma de errar aqui.
 */
export const TABELA_ACEITACAO_DISPONIVEL = false;
