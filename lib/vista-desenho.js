import "server-only";
import { PDFDocument, rgb } from "pdf-lib";
import { verticais, horizontais } from "./campos-desenho";

// A VISTA DO DESENHO — só o desenho da peça, sem carimbo, sem tabelas.
//
// Vitor (21/08/2026): "na questão da imagem do projeto você está anexando o projeto todo, o que não
// precisa; precisamos colocar apenas esse tipo de imagem" — e mandou o print de uma vista, com a
// geometria e as cotas, sem moldura, sem SIMBOLOGIA DE FUROS, sem LISTA DE MATERIAIS e sem carimbo.
//
// Como se faz: o recorte é um RETÂNGULO (é o que `embedPage` aceita), então recortar na área das
// vistas ainda deixa entrar o pedaço das tabelas que cai dentro dele. Por isso, além de recortar,
// as áreas das tabelas são COBERTAS de branco depois de desenhada a página.
//
// ⚠ Nada disso altera o desenho original. É uma figura montada para o relatório; o arquivo no
// SharePoint continua intacto, e é ele que o data book anexa por inteiro quando precisa.

/** Multiplica matrizes de transformação do PDF. */
const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const aplicar = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Todos os pontos de traço da página, já no espaço do usuário. */
function pontosDaPagina(ol, OPS) {
  const pts = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const f = ol.fnArray[i], a = ol.argsArray[i];
    if (f === OPS.save) pilha.push([...ctm]);
    else if (f === OPS.restore) ctm = pilha.pop() || ctm;
    else if (f === OPS.transform) ctm = mul(ctm, a);
    else if (f === OPS.constructPath) {
      const [ops, args] = a;
      let ai = 0;
      for (const op of ops) {
        if (op === OPS.moveTo || op === OPS.lineTo) { pts.push(aplicar(ctm, args[ai], args[ai + 1])); ai += 2; }
        else if (op === OPS.rectangle) {
          const [x, y, w, h] = args.slice(ai, ai + 4); ai += 4;
          pts.push(aplicar(ctm, x, y), aplicar(ctm, x + w, y + h));
        } else if (op === OPS.curveTo) { for (let k = 0; k < 3; k++) { pts.push(aplicar(ctm, args[ai], args[ai + 1])); ai += 2; } }
        else ai += 2;
      }
    }
  }
  return pts;
}

/**
 * Acha as regiões que NÃO são desenho: moldura, coluna da esquerda, lista de materiais e carimbo.
 *
 * ⚠ Nada é posição fixa. A moldura interna sai das linhas mais longas da página; a divisória da
 * coluna direita, da vertical longa que não é moldura; e o corte entre lista (em cima) e carimbo
 * (embaixo) sai da própria extensão dessa divisória.
 */
function regioes(pts, larguraPg, alturaPg, verticaisLongas, horizontaisLongas) {
  // ── A MOLDURA INTERNA, DETECTADA ────────────────────────────────────────────────────────────
  //
  // O desenho tem DUAS molduras: a borda externa da folha e a interna, que delimita a área de
  // desenho. As linhas dela são longas (>80% da página), e a interna é o par MAIS PRÓXIMO do
  // centro. Sem tirar essas linhas do cálculo, o recorte estica até a moldura e sobra meia folha
  // em branco — foi o que aconteceu no primeiro teste.
  const xsFrame = [...new Set(verticaisLongas.filter((v) => v.y2 - v.y1 > alturaPg * 0.8).map((v) => Math.round(v.x)))].sort((a, b) => a - b);
  const ysFrame = [...new Set(horizontaisLongas.filter((h) => h.x2 - h.x1 > larguraPg * 0.8).map((h) => Math.round(h.y)))].sort((a, b) => a - b);
  const meioX = larguraPg / 2, meioY = alturaPg / 2;
  const esqF = Math.max(...xsFrame.filter((x) => x < meioX), larguraPg * 0.02);
  const dirF = Math.min(...xsFrame.filter((x) => x > meioX), larguraPg * 0.98);
  const baseF = Math.max(...ysFrame.filter((y) => y < meioY), alturaPg * 0.02);
  const topoF = Math.min(...ysFrame.filter((y) => y > meioY), alturaPg * 0.98);

  // 4 pt para dentro, pra o traço da própria moldura não entrar no cálculo
  const margem = { esq: esqF + 4, dir: dirF - 4, base: baseF + 4, topo: topoF - 4 };

  // a divisória da coluna direita: vertical longa, no terço direito, que não é a moldura
  const div = verticaisLongas
    .filter((v) => v.x > margem.esq && v.x < margem.dir && v.y2 - v.y1 > alturaPg * 0.15 && v.y2 - v.y1 < alturaPg * 0.7)
    .sort((a, b) => (b.y2 - b.y1) - (a.y2 - a.y1))[0];

  const xDiv = div ? div.x : larguraPg * 0.54;
  // a divisória cobre o carimbo (de baixo até o topo dele); acima disso fica a lista de materiais
  const topoCarimbo = div ? div.y2 : alturaPg * 0.33;

  // ⚠ a linha do "PESO TOTAL" começa recuada, então exigir que ela COMECE na divisória deixava o
  // rodapé do quadro de fora da máscara. Basta começar à direita da divisória e ALCANÇAR a moldura
  // — a vista do CORTE também tem horizontais ali, mas nenhuma vai até a borda da folha.
  const doQuadro = horizontaisLongas.filter(
    (h) => h.x1 >= xDiv - 14 && h.x2 > dirF - 14 && h.y > alturaPg * 0.55,
  );
  const fundoLista = doQuadro.length ? Math.min(...doQuadro.map((h) => h.y)) : topoF - (topoF - baseF) * 0.28;

  return {
    // ⚠ a coluna da esquerda (SIMBOLOGIA, PENAS) fica FORA da moldura interna
    esquerda: { x0: 0, x1: margem.esq + 2, y0: 0, y1: alturaPg },
    // 2 pt de sobra pra engolir o próprio traço da borda do quadro, que senão fica de fora
    carimbo: { x0: xDiv - 2, x1: larguraPg, y0: 0, y1: topoCarimbo + 2 },
    // ⚠ O FUNDO DA LISTA É DETECTADO, não estimado. Com uma fração fixa da altura, a máscara
    // descia demais e comia o título "CORTE: A - A", que fica logo abaixo da tabela. O fundo real é
    // a horizontal MAIS BAIXA que começa na divisória e vai até a moldura — a última linha do
    // quadro.
    lista: { x0: xDiv - 2, x1: larguraPg, y0: fundoLista - 2, y1: alturaPg },
    margem,
  };
}

/**
 * Recorta a vista de um desenho e devolve um PDF de uma página só com ela.
 *
 * @param {Buffer|Uint8Array} pdfBytes
 * @returns {Promise<{bytes:Uint8Array, largura:number, altura:number}|null>}
 */
export async function recortarVista(pdfBytes) {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const { OPS } = await getResolvedPDFJS();

  let pg, ol, vp, textos;
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdfBytes));
    pg = await doc.getPage(1);
    ol = await pg.getOperatorList();
    vp = pg.getViewport({ scale: 1 });
    textos = (await pg.getTextContent()).items.filter((i) => String(i.str).trim());
  } catch { return null; }

  const pts = pontosDaPagina(ol, OPS);
  if (pts.length < 50) return null;

  // ⚠ O TEXTO TAMBÉM CONTA. Cota e título de vista ("CORTE: A - A") são texto, não traço: sem eles
  // no cálculo o recorte fecha na geometria e corta a legenda pela metade — foi o que aconteceu.
  for (const t of textos) {
    const x = t.transform[4], y = t.transform[5];
    const larg = t.width || 0, alt = t.height || 8;
    pts.push([x, y], [x + larg, y + alt]);
  }

  // verticais longas, para achar a divisória da coluna direita
  const vs = verticais(ol, OPS);
  const hs = horizontais(ol, OPS);
  const reg = regioes(pts, vp.width, vp.height, vs, hs);

  const dentro = pts.filter(([x, y]) => {
    if (x <= reg.margem.esq || x >= reg.margem.dir) return false;
    if (y <= reg.margem.base || y >= reg.margem.topo) return false;
    if (x >= reg.carimbo.x0 && y <= reg.carimbo.y1) return false;
    if (x >= reg.lista.x0 && y >= reg.lista.y0) return false;
    return true;
  });
  if (dentro.length < 30) return null;

  const xs = dentro.map((p) => p[0]);
  const ys = dentro.map((p) => p[1]);
  const folga = 10;
  const caixa = {
    left: Math.max(0, Math.min(...xs) - folga),
    right: Math.min(vp.width, Math.max(...xs) + folga),
    bottom: Math.max(0, Math.min(...ys) - folga),
    top: Math.min(vp.height, Math.max(...ys) + folga),
  };
  if (caixa.right - caixa.left < 40 || caixa.top - caixa.bottom < 40) return null;

  const origem = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const out = await PDFDocument.create();
  const emb = await out.embedPage(origem.getPage(0), caixa);
  const page = out.addPage([emb.width, emb.height]);
  page.drawPage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });

  // ── e agora tapa o que sobrou das tabelas dentro do recorte ──────────────────────────────────
  // O recorte é retângulo: a lista de materiais e o carimbo que caem dentro dele continuam
  // aparecendo. Cobrir de branco é o que entrega "apenas a vista".
  const tapar = (r) => {
    const x0 = Math.max(r.x0, caixa.left) - caixa.left;
    const x1 = Math.min(r.x1, caixa.right) - caixa.left;
    const y0 = Math.max(r.y0, caixa.bottom) - caixa.bottom;
    const y1 = Math.min(r.y1, caixa.top) - caixa.bottom;
    if (x1 <= x0 || y1 <= y0) return;
    page.drawRectangle({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, color: rgb(1, 1, 1) });
  };
  tapar(reg.carimbo);
  tapar(reg.lista);
  tapar(reg.esquerda);

  return { bytes: await out.save(), largura: emb.width, altura: emb.height };
}
