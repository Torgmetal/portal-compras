import "server-only";

// O CAMPO "CONSUMÍVEL" QUE O DESENHO JÁ TEM.
//
// Vitor (19/08/2026): "vamos tirar a ideia de colocarmos as rastreabilidades de todos os croquis
// no conjunto; no próprio canto do conjunto temos um espaço para informar a rastreabilidade do
// consumível — ali já basta. Só fazer o controle da emissão e impressão dos conjuntos e informar
// a rastreabilidade correta nesse campo."
//
// O desenho de conjunto traz no canto uma tabela `SOLDADOR | SINETE | CONSUMÍVEL` com duas linhas
// em branco. Em vez de carimbar informação por cima do projeto, a emissão PREENCHE a primeira
// linha da coluna CONSUMÍVEL com o R do arame. Fica no lugar onde o soldador já procura.
//
// Como se acha o campo, sem chutar posição (cada desenho tem o seu):
//   1. o texto "CONSUMÍVEL" sai do pdf.js com posição e largura;
//   2. as LINHAS da tabela saem dos operadores de path da própria página;
//   3. a primeira linha vazia é a faixa entre as duas horizontais logo abaixo do cabeçalho.
// No T89A53 (OP-089) isso dá header 279,1→265,3 e primeira linha 265,3→251,6 — 13,7 pt de altura.

const RX_CONSUMIVEL = /^\s*CONSUM[IÍ]VEL\s*$/i;

const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const aplicar = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// Todos os segmentos HORIZONTAIS da página, já no espaço do usuário (CTM aplicada).
function horizontais(ol, OPS) {
  const out = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha = [];
  const seg = (p1, p2) => {
    if (Math.abs(p1[1] - p2[1]) < 0.6 && Math.abs(p2[0] - p1[0]) > 4) {
      out.push({ y: (p1[1] + p2[1]) / 2, x1: Math.min(p1[0], p2[0]), x2: Math.max(p1[0], p2[0]) });
    }
  };
  for (let i = 0; i < ol.fnArray.length; i++) {
    const f = ol.fnArray[i], a = ol.argsArray[i];
    if (f === OPS.save) pilha.push([...ctm]);
    else if (f === OPS.restore) ctm = pilha.pop() || ctm;
    else if (f === OPS.transform) ctm = mul(ctm, a);
    else if (f === OPS.constructPath) {
      const [ops, args] = a;
      let ai = 0, cx = 0, cy = 0;
      for (const op of ops) {
        if (op === OPS.moveTo) { [cx, cy] = [args[ai], args[ai + 1]]; ai += 2; }
        else if (op === OPS.lineTo) {
          const [nx, ny] = [args[ai], args[ai + 1]]; ai += 2;
          seg(aplicar(ctm, cx, cy), aplicar(ctm, nx, ny));
          [cx, cy] = [nx, ny];
        } else if (op === OPS.rectangle) {
          const [x, y, w, h] = args.slice(ai, ai + 4); ai += 4;
          for (const yy of [y, y + h]) seg(aplicar(ctm, x, yy), aplicar(ctm, x + w, yy));
        } else ai += 2;
      }
    }
  }
  return out;
}

/**
 * Acha a primeira linha em branco da coluna CONSUMÍVEL, em cada página que tiver a tabela.
 * @returns {Promise<Array<{pagina:number, x:number, y:number, larg:number, alt:number}>>}
 *          x/y = centro da célula (espaço do usuário, sem rotação); [] se o desenho não tem o campo
 */
export async function acharCampoConsumivel(pdfBytes) {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const { OPS } = await getResolvedPDFJS();
  const doc = await getDocumentProxy(new Uint8Array(pdfBytes));
  const achados = [];

  for (let n = 1; n <= doc.numPages; n++) {
    let pg, itens;
    try {
      pg = await doc.getPage(n);
      itens = (await pg.getTextContent()).items;
    } catch { continue; }
    const cab = itens.find((i) => RX_CONSUMIVEL.test(i.str || ""));
    if (!cab) continue;

    const [, , , , cx, cy] = cab.transform;
    const larguraTexto = cab.width || 50;
    const centroX = cx + larguraTexto / 2;

    let linhas;
    try { linhas = horizontais(await pg.getOperatorList(), OPS); } catch { continue; }
    // horizontais que cruzam a coluna do cabeçalho, abaixo dele, de baixo pra cima
    const abaixo = linhas
      .filter((l) => l.x1 <= centroX + 2 && l.x2 >= centroX - 2 && l.y < cy)
      .map((l) => l.y)
      .sort((a, b) => b - a);
    // dedup: a mesma linha costuma vir 2x (contorno + preenchimento)
    const ys = abaixo.filter((y, i) => i === 0 || Math.abs(y - abaixo[i - 1]) > 1.5);
    if (ys.length < 2) continue; // sem as duas horizontais não dá pra saber onde é a célula

    const [topo, base] = ys; // topo = fim do cabeçalho, base = fim da 1ª linha em branco
    const alt = topo - base;
    if (alt < 4 || alt > 60) continue; // não é linha de tabela: não escreve às cegas
    achados.push({ pagina: n, x: centroX, y: (topo + base) / 2, larg: larguraTexto + 8, alt });
  }
  return achados;
}
