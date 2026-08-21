// COMO A COTA A / B / C É DESENHADA.
//
// Vitor (21/08/2026), com um exemplo desenhado à mão: "esquece conseguir colocar cota, vamos apenas
// trazer o desenho da maneira que você colocou... você não consegue só criar algumas linhas igual a
// imagem da linha A, B e C, apenas para conseguir mostrar onde vamos medir e colocar as medidas de
// referência?".
//
// Ou seja: NÃO é uma cota medida em cima do traço. É uma linha de chamada clássica, FORA da peça,
// com as duas extensões descendo até os pontos marcados e a letra por cima. Ela não diz quanto mede
// — diz ONDE medir. O valor vive na tabela do relatório.
//
// ⚠ Este módulo é compartilhado pela TELA e pelo PDF de propósito. São dois desenhos do mesmo
// objeto, e qualquer diferença entre eles apareceria como "na tela estava em outro lugar".
//
// ⚠ A peça é desenhada com uma FOLGA em volta (PADDING), senão não há onde pôr as linhas: o recorte
// é justo na peça. As duas pontas do que se marcou continuam nas coordenadas da vista; quem soma a
// folga é o desenho, não o dado.

/** Folga em volta da vista, em unidades da própria vista, onde as linhas de cota são desenhadas. */
export const PADDING = 46;

/** Espaço entre uma linha de cota e a seguinte do mesmo lado. */
const DEGRAU = 15;

/**
 * Onde cada cota deve ser desenhada.
 *
 * @param {Array<{letra,ax,ay,bx,by}>} cotas
 * @param {number} largura da vista (sem a folga)
 * @param {number} altura   da vista (sem a folga)
 * @returns {Array} para cada cota: pontas, linha, extensões e posição da letra — já COM a folga
 *                  somada, prontas para desenhar num espaço (largura+2·PADDING) × (altura+2·PADDING)
 */
export function layoutCotas(cotas, largura, altura) {
  const usados = { topo: 0, base: 0, esq: 0, dir: 0 };
  const saida = [];

  for (const c of cotas || []) {
    if (c?.ax == null || c?.bx == null) { saida.push(null); continue; }
    const ax = c.ax + PADDING, ay = c.ay + PADDING;
    const bx = c.bx + PADDING, by = c.by + PADDING;
    // o que se está medindo: a distância horizontal ou a vertical?
    const vertical = Math.abs(by - ay) > Math.abs(bx - ax);

    let lado, nivel, linha, ext1, ext2, rotulo;
    if (!vertical) {
      // medida horizontal → linha em cima ou embaixo, conforme a metade em que foi marcada
      lado = (ay + by) / 2 > altura / 2 + PADDING ? "topo" : "base";
      nivel = usados[lado]++;
      const y = lado === "topo"
        ? altura + PADDING + 12 + nivel * DEGRAU
        : PADDING - 12 - nivel * DEGRAU;
      linha = { a: [ax, y], b: [bx, y] };
      ext1 = { a: [ax, ay], b: [ax, y + (lado === "topo" ? 4 : -4)] };
      ext2 = { a: [bx, by], b: [bx, y + (lado === "topo" ? 4 : -4)] };
      rotulo = { x: (ax + bx) / 2, y: y + 5, vertical: false };
    } else {
      lado = (ax + bx) / 2 > largura / 2 + PADDING ? "dir" : "esq";
      nivel = usados[lado]++;
      const x = lado === "dir"
        ? largura + PADDING + 12 + nivel * DEGRAU
        : PADDING - 12 - nivel * DEGRAU;
      linha = { a: [x, ay], b: [x, by] };
      ext1 = { a: [ax, ay], b: [x + (lado === "dir" ? 4 : -4), ay] };
      ext2 = { a: [bx, by], b: [x + (lado === "dir" ? 4 : -4), by] };
      rotulo = { x: x - 5, y: (ay + by) / 2, vertical: true };
    }

    saida.push({ letra: c.letra, vertical, lado, linha, ext1, ext2, rotulo, pontas: [[ax, ay], [bx, by]] });
  }
  return saida;
}

/**
 * As duas hastes da seta (ou do tique) numa ponta da linha de cota.
 * Devolve pares de pontos prontos para virar dois traços.
 */
export function setaEm(p, direcao, tam = 5) {
  const [dx, dy] = direcao;
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n, uy = dy / n;
  const px = -uy, py = ux; // perpendicular
  return [
    [p, [p[0] + ux * tam + px * tam * 0.35, p[1] + uy * tam + py * tam * 0.35]],
    [p, [p[0] + ux * tam - px * tam * 0.35, p[1] + uy * tam - py * tam * 0.35]],
  ];
}
