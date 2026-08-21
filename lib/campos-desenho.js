import "server-only";

// OS CAMPOS QUE O DESENHO JÁ TEM — a emissão PREENCHE, em vez de carimbar por cima do projeto.
//
//   conjunto → `SOLDADOR | SINETE | CONSUMÍVEL` (o R do arame)
//   croqui   → `QTD. | RASTREABILIDADE MAT.`   (o R do material, hoje preenchido à mão)
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
export function horizontais(ol, OPS) {
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

// Segmentos VERTICAIS — dão as bordas das colunas (o croqui tem 3 grupos lado a lado, e sem elas
// não dá pra saber onde a coluna QTD acaba e a RASTREABILIDADE começa).
export function verticais(ol, OPS) {
  const out = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha = [];
  const seg = (p1, p2) => {
    if (Math.abs(p1[0] - p2[0]) < 0.6 && Math.abs(p2[1] - p1[1]) > 4) {
      out.push({ x: (p1[0] + p2[0]) / 2, y1: Math.min(p1[1], p2[1]), y2: Math.max(p1[1], p2[1]) });
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
          for (const xx of [x, x + w]) seg(aplicar(ctm, xx, y), aplicar(ctm, xx, y + h));
        } else ai += 2;
      }
    }
  }
  return out;
}

// As faixas em branco abaixo de um cabeçalho: cada par de horizontais consecutivas vira uma linha.
function linhasAbaixo(hs, centroX, yCab, quantas) {
  const abaixo = hs
    .filter((l) => l.x1 <= centroX + 2 && l.x2 >= centroX - 2 && l.y < yCab)
    .map((l) => l.y)
    .sort((a, b) => b - a);
  // dedup: a mesma linha costuma vir 2x (contorno + preenchimento)
  const ys = abaixo.filter((y, i) => i === 0 || Math.abs(y - abaixo[i - 1]) > 1.5);
  const faixas = [];
  for (let i = 0; i + 1 < ys.length && faixas.length < quantas; i++) {
    const alt = ys[i] - ys[i + 1];
    if (alt < 4 || alt > 60) break; // deixou de ser linha de tabela: para de descer
    faixas.push({ y: (ys[i] + ys[i + 1]) / 2, alt });
  }
  return faixas;
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
    const [faixa] = linhasAbaixo(linhas, centroX, cy, 1);
    if (!faixa) continue; // sem as duas horizontais não dá pra saber onde é a célula
    achados.push({ pagina: n, x: centroX, y: faixa.y, larg: larguraTexto + 8, alt: faixa.alt });
  }
  return achados;
}

const RX_RASTREAB = /^\s*RASTREABILIDADE\s*$/i;
const RX_QTD = /^\s*QTD\.?\s*$/i;

/**
 * Campos `QTD. | RASTREABILIDADE MAT.` do CROQUI — hoje preenchidos à MÃO pelo corte. Vitor
 * (18/08): "basicamente pegamos o número na planilha e preenchemos no croqui à mão".
 *
 * O croqui traz TRÊS grupos lado a lado, com 3 linhas em branco cada (9 espaços no total), porque
 * a peça pode sair de mais de uma barra. Devolve as células na ordem de leitura: desce o grupo 1,
 * depois o 2, depois o 3.
 *
 * @returns {Promise<Array<{pagina:number, qtd:Celula, rastreio:Celula}>>} vazio se o desenho não
 *          tiver a tabela (aí o R volta pra tarja e nada se perde)
 */
export async function acharCamposRastreabilidade(pdfBytes) {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const { OPS } = await getResolvedPDFJS();
  const doc = await getDocumentProxy(new Uint8Array(pdfBytes));
  const out = [];

  for (let n = 1; n <= doc.numPages; n++) {
    let pg, itens, ol;
    try {
      pg = await doc.getPage(n);
      itens = (await pg.getTextContent()).items;
      ol = await pg.getOperatorList();
    } catch { continue; }

    const cabs = itens.filter((i) => RX_RASTREAB.test(i.str || ""));
    if (!cabs.length) continue;
    const hs = horizontais(ol, OPS);
    const vs = verticais(ol, OPS);
    const qtds = itens.filter((i) => RX_QTD.test(i.str || ""));

    // grupos na ordem da folha, da esquerda pra direita
    const grupos = cabs
      .map((c) => ({ c, x: c.transform[4], y: c.transform[5] }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    for (const g of grupos) {
      const centroR = g.x + (g.c.width || 80) / 2;
      // bordas da coluna: as verticais que cortam a altura do cabeçalho, à esquerda e à direita
      const cortam = vs.filter((v) => v.y1 <= g.y && v.y2 >= g.y + 4).map((v) => v.x).sort((a, b) => a - b);
      const esq = [...cortam].reverse().find((x) => x < g.x - 1);
      const dir = cortam.find((x) => x > centroR);
      if (esq == null || dir == null) continue;

      // a coluna QTD é a vizinha à esquerda, e tem o cabeçalho "QTD." na mesma altura
      const qtdCab = qtds.find((q) => Math.abs(q.transform[5] - g.y) < 3 && q.transform[4] < esq && q.transform[4] > esq - 60);
      const esqQtd = qtdCab ? [...cortam].reverse().find((x) => x < qtdCab.transform[4] - 1) : null;

      const faixas = linhasAbaixo(hs, (esq + dir) / 2, g.y, 3);
      for (const f of faixas) {
        out.push({
          pagina: n,
          rastreio: { x: (esq + dir) / 2, y: f.y, larg: dir - esq - 6, alt: f.alt },
          qtd: qtdCab && esqQtd != null
            ? { x: (esqQtd + esq) / 2, y: f.y, larg: esq - esqQtd - 4, alt: f.alt }
            : null,
        });
      }
    }
  }
  return out;
}

/**
 * A MOLDURA do desenho — pra tarja de emissão sentar na margem e não em cima do projeto.
 *
 * Vitor (19/08): "alinhe ele para ficar na margem correta, e acredito ser melhor ele ficar na
 * margem de baixo, pois em cima ficou poluído".
 *
 * O desenho da Torg tem moldura DUPLA: uma linha externa quase na borda do papel e outra interna,
 * com uma faixa entre elas (só as marcas de centragem moram ali). É nessa faixa que a tarja cabe
 * sem tapar nada — medido: A3 26,5 pt · A2 27,5 pt · A4 14,1 pt.
 *
 * ⚠ Ignora as linhas coladas na borda do papel: elas são o contorno da própria folha, não moldura.
 *
 * `yTextoMin` = a linha de texto mais baixa que o DESENHO já escreve nessa faixa (o
 * "FORMATO A3 - 420x297mm" fica sempre lá). A tarja entra abaixo dela — foi o que faltava no
 * primeiro corte e a linha saiu em cima do formato no A4.
 *
 * @returns {Promise<Map<number,{x0,x1,yBase,yTopo,yTextoMin}>>} por página
 */
export async function acharMoldura(pdfBytes) {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const { OPS } = await getResolvedPDFJS();
  const doc = await getDocumentProxy(new Uint8Array(pdfBytes));
  const out = new Map();

  for (let n = 1; n <= doc.numPages; n++) {
    let pg, ol, vp, itens;
    try {
      pg = await doc.getPage(n);
      vp = pg.getViewport({ scale: 1 });
      ol = await pg.getOperatorList();
      itens = (await pg.getTextContent()).items;
    } catch { continue; }
    const naBorda = (v, lim) => v < 3 || v > lim - 3;
    const ys = [...new Set(horizontais(ol, OPS)
      .filter((l) => l.x2 - l.x1 > vp.width * 0.7 && !naBorda(l.y, vp.height))
      .map((l) => Math.round(l.y * 10) / 10))].sort((a, b) => a - b);
    const xs = [...new Set(verticais(ol, OPS)
      .filter((l) => l.y2 - l.y1 > vp.height * 0.7 && !naBorda(l.x, vp.width))
      .map((l) => Math.round(l.x * 10) / 10))].sort((a, b) => a - b);
    if (ys.length < 2 || xs.length < 2) continue;

    // Há DOIS desenhos de moldura na Torg e o segundo só apareceu quando testei um croqui de
    // outra exportação do Tekla:
    //   DUPLA  — duas linhas próximas (≤40 pt) e a faixa entre elas é a margem (A3, A2, alguns A4)
    //   SIMPLES— uma linha só; a margem é o papel entre ela e a borda da folha (croqui 842x595)
    const duplo = ys.length >= 4 && xs.length >= 4 && ys[1] - ys[0] < 40 && xs[1] - xs[0] < 40;
    const x0 = duplo ? xs[1] : xs[0];
    const x1 = duplo ? xs[xs.length - 2] : xs[xs.length - 1];
    const yBase = duplo ? ys[0] : 0;
    const yTopo = duplo ? ys[1] : ys[0];
    if (yTopo - yBase < 9 || x1 - x0 < 100) continue; // faixa fina demais: não força

    // O que o DESENHO já escreve nessa faixa (o "FORMATO A4 - 297x210mm" está sempre lá): a tarja
    // desvia dele — por baixo quando sobra altura, senão pela direita, na mesma linha.
    const naFaixa = itens.filter((i) => i.str?.trim()
      && i.transform[5] >= yBase - 1 && i.transform[5] <= yTopo + 1
      && i.transform[4] >= x0 - 5 && i.transform[4] <= x1);
    out.set(n, {
      x0, x1, yBase, yTopo, duplo,
      yTextoMin: naFaixa.length ? Math.min(...naFaixa.map((i) => i.transform[5])) : yTopo,
      xTextoFim: naFaixa.length ? Math.max(...naFaixa.map((i) => i.transform[4] + (i.width || 0))) : x0,
      // altura do texto que o desenho já usa na margem — a tarja copia essa escala quando entra na
      // mesma linha, senão passa por cima do filete e destoa do rodapé da folha
      hTexto: naFaixa.length ? Math.max(...naFaixa.map((i) => i.height || 0)) : 0,
    });
  }
  return out;
}
