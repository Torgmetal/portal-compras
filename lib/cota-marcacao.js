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
 * @param {Array<{letra,ax,ay,bx,by,lado,afastamento}>} cotas `lado` ("topo"/"base" ou "esq"/"dir")
 *   força o lado escolhido à mão; sem ele, o lado sai sozinho da metade da folha onde a cota foi
 *   marcada. `afastamento` (pt, na vista) força a distância da linha até a peça; sem ele, sai do
 *   degrau automático (12pt + 15pt por cota que já ocupa aquele lado).
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
      // ⚠⚠ O LADO ESCOLHIDO À MÃO VALE POR CIMA DA METADE AUTOMÁTICA. Vitor (03/09/2026): "eu
      // preciso conseguir editar para qual lado eu quero que a representação da cota vai ficar,
      // hoje você escolhe por mim... quero poder fazer isso marcando mas podendo ajustar ela" — a
      // metade da folha é só o palpite de partida, não a palavra final: o desenho pode ter outra
      // cota, texto ou traço bem onde o palpite mandaria a linha, e só quem está olhando vê isso.
      lado = c.lado === "topo" || c.lado === "base" ? c.lado
        : (ay + by) / 2 > altura / 2 + PADDING ? "topo" : "base";
      nivel = usados[lado]++;
      // ⚠⚠ AFASTAMENTO ESCOLHIDO À MÃO. Vitor (03/09/2026): "seria bom poder ajustar a altura dela
      // também... deixar mais comprida ou mais curta" — a distância padrão (12 + um degrau por
      // cota que já ocupa o lado) é só o ponto de partida; `afastamento`, quando presente, substitui
      // a conta inteira para ESTA cota. Limitado à PADDING - 6: além disso a linha sairia da folga
      // reservada em volta da peça e seria cortada no desenho e no PDF.
      const base = c.afastamento != null ? Math.min(c.afastamento, PADDING - 6) : 12 + nivel * DEGRAU;
      const y = lado === "topo" ? altura + PADDING + base : PADDING - base;
      linha = { a: [ax, y], b: [bx, y] };
      ext1 = { a: [ax, ay], b: [ax, y + (lado === "topo" ? 4 : -4)] };
      ext2 = { a: [bx, by], b: [bx, y + (lado === "topo" ? 4 : -4)] };
      rotulo = { x: (ax + bx) / 2, y: y + 5, vertical: false };
    } else {
      lado = c.lado === "esq" || c.lado === "dir" ? c.lado
        : (ax + bx) / 2 > largura / 2 + PADDING ? "dir" : "esq";
      nivel = usados[lado]++;
      const base = c.afastamento != null ? Math.min(c.afastamento, PADDING - 6) : 12 + nivel * DEGRAU;
      const x = lado === "dir" ? largura + PADDING + base : PADDING - base;
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
