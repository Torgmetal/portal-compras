// ─── AS TOLERÂNCIAS DO PO-04 ───────────────────────────
//
// Fonte: **PO-04 Tolerâncias de Fabricação, Rev. 1**, aprovado em 06/02/2026 (Guilherme Agnelli
// Corte Campos, Diretor Técnico; Vitor Hugo Almeida, Diretor Comercial). O PDF vive no portal como
// DocumentoQualidade — `procedimentoTolerancia()` em lib/relatorio-dimensional.js devolve o nome
// com a revisão, e é ele que o rodapé do relatório imprime.
//
// ⚠⚠ ISTO É O ÚLTIMO RECURSO, NÃO O PRIMEIRO. O próprio procedimento diz duas vezes:
//
//   item 1 — "As tolerâncias aqui definidas deverão ser adotadas sempre que não houver
//   especificação explícita em requisitos contratuais do Cliente, nos Desenhos de Fabricação
//   emitidos pela Engenharia do Produto ou nos documentos da Engenharia da Qualidade, tais como
//   Plano de Inspeção e Teste (PIT)".
//
//   tarja amarela da p. 3 — "Estas tabelas somente deverão ser utilizadas para tolerâncias não
//   especificadas nos desenhos de fabricação."
//
// A ordem é: DESENHO → contrato/PIT → PO-04. Por isso tudo aqui SUGERE; nada decide. O inspetor
// sobrescreve sempre que o desenho mandar outra coisa, e é assim que a tela usa.
//
// ⚠⚠ POR QUE ISTO PASSOU A EXISTIR. Vitor (07/09/2026): "fui informado que peças maiores têm uma
// tolerância maior, sabe dizer qual é essa tolerância, nosso procedimento fala alguma coisa?".
// Falava — e o portal não sabia. O relatório dimensional imprimia "Tolerâncias conforme PO-04" no
// rodapé enquanto a tela oferecia **± 3 mm fixo** para qualquer peça, de 20 mm a 13,6 metros. O ±3
// só é correto na faixa de 400 a 2000 mm. Medido em 07/09/2026 na LPC: 2.727 peças estão na faixa
// de ±4 e 270 na de ±5 — todas nasciam com ±3 sugerido.

/**
 * §5.2 — Corte e dobramento. Chapas e perfis, QUALQUER espessura, pelo comprimento nominal em mm.
 * É a tabela que interessa ao relatório dimensional: as cotas A/B/C medem a peça cortada.
 */
const CORTE = [
  { ate: 400, tol: 2 },     // 35 a 400
  { ate: 2000, tol: 3 },    // 400 a 2000
  { ate: 8000, tol: 4 },    // 2000 a 8000
  { ate: 16000, tol: 5 },   // 8000 a 16000
  { ate: Infinity, tol: 6 }, // acima de 16000
];

/** §5.2, nota — tubulação não escala: é ± 3 mm em qualquer comprimento. */
export const TOL_CORTE_TUBO = 3;

/**
 * §5.3 — Usinagem, dimensões lineares (exceto raios e chanfros).
 * Não é a tabela do dimensional de conjunto; fica aqui porque é o mesmo procedimento e alguém vai
 * precisar. Só se aplica a dimensão usinada.
 */
const USINAGEM = [
  { ate: 3, tol: 0.2 }, { ate: 6, tol: 0.3 }, { ate: 30, tol: 0.5 }, { ate: 120, tol: 0.8 },
  { ate: 400, tol: 1.2 }, { ate: 1000, tol: 2 }, { ate: 2000, tol: 3 }, { ate: 4000, tol: 4 },
  { ate: Infinity, tol: 5 },
];

/** §5.3, furações — posicionamento do furo, pela dimensão nominal. */
const FURO_POSICAO = [{ ate: 2000, tol: 3 }, { ate: Infinity, tol: 4 }];

const buscar = (tabela, mm) => {
  const v = Number(mm);
  if (!Number.isFinite(v) || v <= 0) return null;
  return (tabela.find((f) => v <= f.ate) || tabela[tabela.length - 1]).tol;
};

/**
 * Tolerância de corte sugerida para uma peça, em mm (§5.2).
 *
 * @param {number|null|undefined} comprimentoMm comprimento nominal da peça
 * @param {{tubo?: boolean}} [opcoes] `tubo: true` devolve o ±3 fixo da nota do §5.2
 * @returns {number|null} a tolerância em mm, ou null quando não há comprimento para decidir
 */
export function toleranciaCorte(comprimentoMm, opcoes = {}) {
  if (opcoes.tubo) return TOL_CORTE_TUBO;
  return buscar(CORTE, comprimentoMm);
}

/** Tolerância de usinagem sugerida, em mm (§5.3). */
export function toleranciaUsinagem(dimensaoMm) {
  return buscar(USINAGEM, dimensaoMm);
}

/** Tolerância de posicionamento de furo, em mm (§5.3). */
export function toleranciaFuro(dimensaoMm) {
  return buscar(FURO_POSICAO, dimensaoMm);
}

/**
 * A faixa do §5.2 por extenso, para a tela poder dizer DE ONDE veio o número em vez de só mostrá-lo.
 * Sem isto a sugestão é um valor mágico, e valor mágico ninguém confere.
 *
 * @param {number|null|undefined} comprimentoMm
 * @returns {{tol: number, faixa: string, origem: string} | null}
 */
export function faixaCorte(comprimentoMm) {
  const tol = toleranciaCorte(comprimentoMm);
  if (tol == null) return null;
  const v = Number(comprimentoMm);
  const faixa = v <= 400 ? "35 a 400 mm"
    : v <= 2000 ? "400 a 2.000 mm"
    : v <= 8000 ? "2.000 a 8.000 mm"
    : v <= 16000 ? "8.000 a 16.000 mm"
    : "acima de 16.000 mm";
  return { tol, faixa, origem: "PO-04 §5.2" };
}

// ─── O QUE FICOU DE FORA, DE PROPÓSITO ─────────────────
//
// O §5.4 (montagem) não vira função porque não é tabela de consulta por comprimento: cada item tem
// o SEU parâmetro e o seu desenho de referência — coluna pelo D, viga pelo D, perpendicularidade
// pelo K3, torção pelo K4. E acima de certo tamanho vários deixam de ser número fixo e viram
// PROPORÇÃO da dimensão (K3 com D>3000 é ≤0,002·d; a torção de viga caixão com L>12000 é ≤0,008·d;
// a curvatura de diagonais é <0,0012·L com teto de 12 mm). Reduzir isso a uma função de um número
// só produziria sugestão errada com cara de certa — pior do que não sugerir. Ali o inspetor lê o
// procedimento e digita, que é o que ele já faz.
