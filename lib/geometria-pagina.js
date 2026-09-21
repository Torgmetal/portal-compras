import "server-only";

// ─── O ESPAÇO EM QUE A FOLHA É LIDA ──────────────────────────────────────────
//
// ⚠⚠ O PDF.js E O pdf-lib NÃO FALAM O MESMO SISTEMA DE COORDENADAS, e por isso desenho girado
// vinha CORTADO (18/09/2026). Medido num PDF `842x1191` com `/Rotate 90`:
//
//     getViewport({scale:1}) diz que a folha é  1191 x 842   (JÁ rotacionada)
//     getOperatorList()      devolve traço em   x 0..802, y 0..1151   (NÃO rotacionada)
//
// Os filtros de `vista-desenho.js` ("está dentro da folha?") comparavam as coordenadas CRUAS com
// as dimensões ROTACIONADAS: tudo que passava de 844 em y era descartado em silêncio. A tela de
// recorte manual já recebia a folha incompleta — e é por isso que "ajustar recorte" não
// resolvia: não dá para enquadrar o que nunca chegou.
//
// ⚠ O mesmo vale para `/Rotate 270` e para folha com CropBox deslocada: o viewport normaliza a
// origem, a operator list não.
//
// A saída deste módulo é UM espaço só, usado por todo mundo: **folha já orientada, origem no canto
// inferior esquerdo, Y crescendo para cima** — que é o que a tela de recorte já desenha (ela
// inverte o Y na hora de pintar) e o que o `embedPage` espera receber de volta.
//
// ⚠⚠ COM `/Rotate 0` E CAIXA NA ORIGEM, `M` É A IDENTIDADE. Essa é a propriedade que torna a
// correção segura: todo desenho que hoje sai certo continua saindo byte a byte igual.

/** Multiplica matrizes de transformação do PDF: `mul(a, b)` aplica `b` primeiro, depois `a`. */
export const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

/** Aplica a matriz a um ponto. */
export const aplicar = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export const IDENTIDADE = [1, 0, 0, 1, 0, 0];

/** A inversa de uma matriz afim. `null` se for degenerada (não deve acontecer num PDF válido). */
export function inverter(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return null;
  return [
    m[3] / det, -m[1] / det,
    -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

/** Verdadeiro quando a matriz é a identidade — o caminho de quem não tem rotação nem deslocamento. */
export const ehIdentidade = (m) =>
  m.length === 6 && m.every((v, i) => Math.abs(v - IDENTIDADE[i]) < 1e-9);

/**
 * A matriz que leva o user space CRU da página para o espaço da folha orientada (Y para cima).
 *
 * ⚠⚠ NÃO É `vp.transform` SOZINHO. O transform do viewport entrega Y para BAIXO (é o sistema do
 * canvas), e a tela deste projeto desenha com Y para CIMA — invertendo na hora de pintar. Usar o
 * transform cru viraria de cabeça para baixo todo desenho que hoje sai certo. A inversão vertical
 * entra DEPOIS da rotação, e nessa ordem: em 90/270 a ordem muda o resultado.
 *
 * @param {object} pg página do pdf.js (`doc.getPage(1)`)
 * @returns {{M:number[], inv:number[], largura:number, altura:number, girada:boolean}}
 */
export function espacoDaPagina(pg) {
  const vp = pg.getViewport({ scale: 1 });
  const M = mul([1, 0, 0, -1, 0, vp.height], vp.transform);
  return {
    M,
    inv: inverter(M) || IDENTIDADE,
    largura: vp.width,
    altura: vp.height,
    // ⚠ "girada" no sentido de "a matriz faz alguma coisa" — inclui CropBox deslocada, não só
    // `/Rotate`. É o que decide se vale a pena pagar a conversão de volta no recorte.
    girada: !ehIdentidade(M),
  };
}

/**
 * Leva uma caixa do espaço da folha orientada de volta ao user space CRU, que é onde o
 * `embedPage` do pdf-lib recorta.
 *
 * ⚠⚠ CONVERTE OS QUATRO CANTOS, não só dois. Sob rotação de 90°, o canto inferior-esquerdo vira
 * o superior-esquerdo: transformar só `(left,bottom)` e `(right,top)` devolveria uma caixa
 * invertida, e o recorte sairia vazio ou no lugar errado (achado do Codex, 18/09/2026).
 */
export function caixaParaCru(caixa, inv) {
  const cantos = [
    aplicar(inv, caixa.left, caixa.bottom),
    aplicar(inv, caixa.right, caixa.bottom),
    aplicar(inv, caixa.right, caixa.top),
    aplicar(inv, caixa.left, caixa.top),
  ];
  const xs = cantos.map((p) => p[0]), ys = cantos.map((p) => p[1]);
  return {
    left: Math.min(...xs), right: Math.max(...xs),
    bottom: Math.min(...ys), top: Math.max(...ys),
  };
}

/** Translação, para compor a matriz de desenho do recorte. */
export const transladar = (tx, ty) => [1, 0, 0, 1, tx, ty];

/**
 * A caixa que um texto ocupa, no espaço da folha orientada.
 *
 * ⚠⚠ NÃO É `(x, y) → (x + largura, y + altura)` (achado do Codex, 18/09/2026). Isso supõe que o
 * texto avança para a DIREITA e sobe — verdade só quando nada foi girado. Numa folha com
 * `/Rotate 90`, ou numa cota escrita na vertical, o avanço aponta para outro lado e a caixa
 * crescia para fora do texto: cota rente à borda continuava sendo cortada mesmo depois da
 * correção da rotação.
 *
 * A direção vem da PRÓPRIA matriz composta: `(m[0], m[1])` é para onde a linha de base anda,
 * `(m[2], m[3])` é para onde ela sobe.
 *
 * @param {number[]} m matriz do texto JÁ composta com a da página
 * @param {number} largura avanço do texto, em pontos do usuário (`item.width` do pdf.js)
 * @param {number} altura altura da linha (`item.height`)
 */
export function caixaDoTexto(m, largura, altura) {
  const norma = (x, y) => { const d = Math.hypot(x, y); return d < 1e-9 ? [0, 0] : [x / d, y / d]; };
  const [ux, uy] = norma(m[0], m[1]);   // para onde o texto avança
  const [vx, vy] = norma(m[2], m[3]);   // para onde ele sobe
  const w = largura || 0, h = altura || 0;
  const cantos = [
    [m[4], m[5]],
    [m[4] + ux * w, m[5] + uy * w],
    [m[4] + ux * w + vx * h, m[5] + uy * w + vy * h],
    [m[4] + vx * h, m[5] + vy * h],
  ];
  const xs = cantos.map((p) => p[0]), ys = cantos.map((p) => p[1]);
  return {
    left: Math.min(...xs), right: Math.max(...xs),
    bottom: Math.min(...ys), top: Math.max(...ys),
  };
}

// ─── A VERSÃO DO ESPAÇO DE COORDENADAS ───────────────────────────────────────
//
// ⚠⚠ RECORTE GRAVADO ANTES DE 18/09/2026 NASCEU NOUTRO CONTRATO. Até então, a caixa escolhida à
// mão era entregue CRUA ao `embedPage`, sobre uma folha cuja geometria podia estar truncada pela
// confusão de espaços. Reaplicá-la agora, calada, poria o recorte noutro lugar — e as cotas
// marcadas em cima dele iriam junto.
//
// ⚠ Quando a matriz da página é a IDENTIDADE (o caso da esmagadora maioria: `/Rotate 0` com caixa
// na origem), os dois contratos coincidem — aí o recorte antigo continua valendo e nada muda. A
// decisão é tomada POR DESENHO, na hora de ler, e não por migração às cegas: não há como saber de
// antemão quais folhas são giradas sem abrir cada PDF.
export const ESPACO_ATUAL = 2;

/** Um recorte gravado pode ser reaplicado nesta folha? */
export function recorteAproveitavel(recorte, espaco) {
  if (!recorte) return { ok: false, motivo: "sem recorte" };
  if (recorte.espaco === ESPACO_ATUAL) return { ok: true };
  // legado: só vale onde os dois contratos coincidem
  if (!espaco.girada) return { ok: true };
  return { ok: false, motivo: "recorte antigo, feito antes da correção de orientação desta folha" };
}
