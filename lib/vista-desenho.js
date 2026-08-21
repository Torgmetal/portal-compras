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

/**
 * Todos os pontos de traço da página, já no espaço do usuário.
 *
 * ⚠ AMOSTRA AO LONGO DO SEGMENTO, não só as pontas. Uma linha de 400 pt entre duas pontas deixa a
 * grade vazia no meio, e o agrupamento por vizinhança quebra a mesma vista em dezenas de pedaços —
 * foi o que aconteceu: 26 grupos onde havia 3 vistas.
 */
function pontosDaPagina(ol, OPS, passo = 5) {
  const pts = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha = [];
  const traco = (p1, p2) => {
    pts.push(p1, p2);
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const d = Math.hypot(dx, dy);
    if (d <= passo) return;
    // teto por segmento: desenho com traço muito longo não pode explodir a memória
    const n = Math.min(Math.floor(d / passo), 400);
    for (let k = 1; k < n; k++) pts.push([p1[0] + (dx * k) / n, p1[1] + (dy * k) / n]);
  };
  for (let i = 0; i < ol.fnArray.length; i++) {
    const f = ol.fnArray[i], a = ol.argsArray[i];
    if (f === OPS.save) pilha.push([...ctm]);
    else if (f === OPS.restore) ctm = pilha.pop() || ctm;
    else if (f === OPS.transform) ctm = mul(ctm, a);
    else if (f === OPS.constructPath) {
      const [ops, args] = a;
      let ai = 0, cur = null;
      for (const op of ops) {
        if (op === OPS.moveTo) { cur = aplicar(ctm, args[ai], args[ai + 1]); pts.push(cur); ai += 2; }
        else if (op === OPS.lineTo) {
          const p = aplicar(ctm, args[ai], args[ai + 1]); ai += 2;
          if (cur) traco(cur, p); else pts.push(p);
          cur = p;
        } else if (op === OPS.rectangle) {
          const [x, y, w, h] = args.slice(ai, ai + 4); ai += 4;
          const a1 = aplicar(ctm, x, y), a2 = aplicar(ctm, x + w, y), a3 = aplicar(ctm, x + w, y + h), a4 = aplicar(ctm, x, y + h);
          traco(a1, a2); traco(a2, a3); traco(a3, a4); traco(a4, a1);
          cur = a1;
        } else if (op === OPS.curveTo) {
          for (let k = 0; k < 3; k++) { const p = aplicar(ctm, args[ai], args[ai + 1]); ai += 2; pts.push(p); cur = p; }
        } else ai += 2;
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

  // ── FOLHA DE CROQUI ─────────────────────────────────────────────────────────────────────────
  //
  // O croqui (A4) não tem coluna à direita: tem uma FAIXA de tabelas em cima (QTD. /
  // RASTREABILIDADE MAT.) e o carimbo numa faixa embaixo, ocupando a largura toda. É outro desenho
  // e pede outro corte — tentar achar "a vista" por agrupamento ali escolhia a cadeia de cotas ou o
  // logo da Torg, porque o logo é vetor pesado.
  //
  // Reconhece-se pela horizontal que atravessa quase toda a largura no terço de baixo: é o topo do
  // carimbo. O quadro do conjunto não tem essa linha (as tabelas dele ficam na coluna direita).
  const larguraUtil = dirF - esqF;
  const faixaBaixo = horizontaisLongas
    .filter((h) => h.x2 - h.x1 > larguraUtil * 0.75 && h.y > baseF + 2 && h.y < baseF + (topoF - baseF) * 0.32)
    .map((h) => h.y);
  const topoCarimboFaixa = faixaBaixo.length ? Math.max(...faixaBaixo) : null;

  const faixaCima = horizontaisLongas
    .filter((h) => h.x2 - h.x1 > larguraUtil * 0.3 && h.y < topoF - 2 && h.y > topoF - (topoF - baseF) * 0.22)
    .map((h) => h.y);
  const fundoTabelasTopo = faixaCima.length ? Math.min(...faixaCima) : null;
  const ehCroqui = topoCarimboFaixa != null;

  return {
    ehCroqui,
    // faixas da folha de croqui (nulas no desenho de conjunto)
    faixaInferior: topoCarimboFaixa != null ? { x0: 0, x1: larguraPg, y0: 0, y1: topoCarimboFaixa + 2 } : null,
    faixaSuperior: fundoTabelasTopo != null ? { x0: 0, x1: larguraPg, y0: fundoTabelasTopo - 2, y1: alturaPg } : null,
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
 * A FAIXA DO DESENHO numa folha de croqui.
 *
 * Vitor (21/08/2026), vendo o croqui inteiro no relatório: "você ainda traz o croqui todo".
 *
 * O croqui é uma folha em três andares, separados por vazio:
 *
 *   tabelas de rastreabilidade + "liberado p/ fabricação"   ← encosta no topo
 *   as VISTAS da peça, com as cotas                          ← o que interessa
 *   carimbo: logo, responsáveis, convenções, perfil          ← encosta no rodapé
 *
 * Achar "a vista" por agrupamento em DUAS dimensões falhou aqui: o logo da Torg é vetor pesado e
 * vencia a peça inteira em quantidade de traço. Em UMA dimensão o problema some — projeta-se o
 * conteúdo no eixo vertical, corta-se nos vazios, e descarta-se o andar que encosta no topo e o que
 * encosta no rodapé. Sobra a peça.
 */
function faixaDoDesenho(pts, margem, vazioMin = 9) {
  if (!pts.length) return null;
  const cel = 3;
  const ocupado = new Map();
  for (const [, y] of pts) {
    const j = Math.floor(y / cel);
    ocupado.set(j, (ocupado.get(j) || 0) + 1);
  }
  const js = [...ocupado.keys()].sort((a, b) => a - b);

  const andares = [];
  let atual = { j0: js[0], j1: js[0], n: 0 };
  for (const j of js) {
    if ((j - atual.j1) * cel > vazioMin) { andares.push(atual); atual = { j0: j, j1: j, n: 0 }; }
    atual.j1 = j;
    atual.n += ocupado.get(j);
  }
  andares.push(atual);

  const comY = andares.map((a) => ({ ...a, y0: a.j0 * cel, y1: (a.j1 + 1) * cel }));
  // ⚠ o que encosta na moldura é tabela ou carimbo, nunca a vista
  const meio = comY.filter((a) => a.y0 > margem.base + 8 && a.y1 < margem.topo - 8);
  if (!meio.length) return comY.sort((a, b) => b.n - a.n)[0] || null;

  // ⚠ JUNTA TODOS OS ANDARES DO MEIO, não só o maior. A peça costuma ter duas vistas (planta e
  // elevação) separadas por um vazio; pegar só a maior cortava a segunda pela metade.
  //
  // Andar minúsculo fica de fora: é o QR ou uma legenda solta, não vista.
  const maior = Math.max(...meio.map((a) => a.n));
  const valem = meio.filter((a) => a.n > maior * 0.05);
  return {
    y0: Math.min(...valem.map((a) => a.y0)),
    y1: Math.max(...valem.map((a) => a.y1)),
    n: valem.reduce((t, a) => t + a.n, 0),
  };
}

/**
 * A VISTA PRINCIPAL — a maior das vistas do desenho.
 *
 * Vitor (21/08/2026): "você ainda trouxe muitas peças que não fazem parte; precisa deixar sempre
 * uma principal". O desenho traz a planta, a elevação e os cortes lado a lado; para o relatório
 * interessa UMA — a que mostra a peça inteira com as cotas gerais.
 *
 * Como se separa: as vistas são ilhas de traço separadas por vazio. Marcando os pontos numa grade e
 * juntando as células vizinhas (com uma folga que faz a cota grudar na sua vista), cada ilha vira
 * um grupo. A principal é a de MAIOR ÁREA — não a de mais pontos, senão um corte cheio de hachura
 * ganharia da vista inteira da peça.
 */
function vistaPrincipal(pts, margem, folgaCel = 7) {
  const cel = 6;
  const mapa = new Map();
  const chave = (i, j) => `${i}|${j}`;
  for (const [x, y] of pts) {
    const i = Math.floor(x / cel), j = Math.floor(y / cel);
    const k = chave(i, j);
    const g = mapa.get(k) || { i, j, pts: [] };
    g.pts.push([x, y]);
    mapa.set(k, g);
  }

  const visitado = new Set();
  const grupos = [];
  for (const k of mapa.keys()) {
    if (visitado.has(k)) continue;
    const fila = [k];
    visitado.add(k);
    const grupo = [];
    while (fila.length) {
      const atual = fila.pop();
      const c = mapa.get(atual);
      if (!c) continue;
      grupo.push(c);
      // ⚠ vizinhança LARGA (~42 pt). A cota fica afastada do traço e o contorno é tracejado; com
      // folga curta a mesma vista virava vários grupos e o recorte pegava só a cadeia de cotas.
      for (let di = -folgaCel; di <= folgaCel; di++) {
        for (let dj = -folgaCel; dj <= folgaCel; dj++) {
          const nk = chave(c.i + di, c.j + dj);
          if (mapa.has(nk) && !visitado.has(nk)) { visitado.add(nk); fila.push(nk); }
        }
      }
    }
    const todos = grupo.flatMap((c) => c.pts);
    const xs = todos.map((p) => p[0]), ys = todos.map((p) => p[1]);
    const bb = { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
    grupos.push({ bb, n: todos.length, area: (bb.right - bb.left) * (bb.top - bb.bottom) });
  }
  if (!grupos.length) return null;

  // ── O QUE ENCOSTA NA MOLDURA NÃO É VISTA ────────────────────────────────────────────────────
  //
  // Carimbo e tabelas são construídos a partir da borda: encostam no rodapé (croqui) ou no canto
  // (conjunto). As vistas flutuam no meio da folha. Este é o único sinal que separa os dois em
  // qualquer formato — contar traço não separa, porque o logo da Torg é vetor pesado e ganhava de
  // uma peça inteira (croqui T89A-P3 saía com o logo no lugar do desenho).
  const encosta = (g) =>
    g.bb.bottom <= margem.base + 6 || g.bb.top >= margem.topo - 6 ||
    g.bb.left <= margem.esq + 6 || g.bb.right >= margem.dir - 6;
  const soltas = grupos.filter((g) => !encosta(g));
  // ⚠ se TUDO encosta, não dá pra descartar: melhor a folha inteira que um recorte vazio
  const candidatos = soltas.length ? soltas : grupos;

  // ⚠ CRITÉRIO: densidade de traço, não área pura. O carimbo é uma caixa grande e quase vazia — no
  // croqui (A4 retrato, carimbo no rodapé ocupando a largura toda) ele ganhava da peça pela área e
  // o relatório saía com o logo da Torg no lugar do desenho. Contar os pontos amostrados premia a
  // vista, que tem contorno, furos e linhas de cota; e a área ainda entra com raiz, pra um detalhe
  // pequeno e muito denso não passar na frente da peça inteira.
  candidatos.sort((a, b) => b.n * Math.sqrt(b.area) - a.n * Math.sqrt(a.area));
  return candidatos[0];
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

  // ⚠ O TEXTO NÃO ENTRA NO AGRUPAMENTO — só na hora de fechar a moldura.
  //
  // Carimbo e tabelas são quase só texto: somá-lo aos pontos fazia o carimbo virar a maior "ilha" e
  // o relatório saía com o logo da Torg no lugar do desenho (croqui T89A-P3). Agrupando só pelo
  // TRAÇO, quem ganha é a peça; o texto entra depois, para a cota não ser cortada na borda.
  const pontosTexto = textos.map((t) => ({
    x: t.transform[4], y: t.transform[5], larg: t.width || 0, alt: t.height || 8,
  }));

  // verticais longas, para achar a divisória da coluna direita
  const vs = verticais(ol, OPS);
  const hs = horizontais(ol, OPS);
  const reg = regioes(pts, vp.width, vp.height, vs, hs);

  // ⚠ FOLHA DE CROQUI NÃO USA AS MÁSCARAS DO CONJUNTO.
  //
  // No A3 as tabelas ficam numa coluna à direita e o carimbo no canto — daí as máscaras por região.
  // O croqui (A4) não tem coluna nenhuma: a moldura dele não tem linha interna atravessando, e
  // aplicar aquelas máscaras cortava justamente a peça (o `xDiv` caía no meio do desenho). Aqui o
  // corte é vertical, por faixa, e não precisa de máscara: o recorte já exclui os outros andares.
  const ehFolhaCroqui = vp.width < 900;

  // ── OS CORTES NÃO SÃO A VISTA ───────────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026), vendo o recorte sair com CORTE A-A, B-B, D-D, E-E e F-F junto: "então mas
  // não pode ser, precisa ver isso e trazer as cotas simples que falamos".
  //
  // Por geometria não dava: os cortes ficam logo abaixo da vista, dentro dos ~42 pt de vizinhança
  // que o agrupamento precisa ter (a cota fica longe do traço, e apertar a folga quebrava a própria
  // vista em pedaços). O sinal que resolve é SEMÂNTICO — o desenho ROTULA cada corte. No T89A3 os
  // rótulos estão em y=525 e y=295, e a vista principal fica inteira acima deles.
  //
  // ⚠ O rótulo fica ACIMA do corte que ele nomeia, então o que vale é o MAIS ALTO: dali para baixo
  // é tudo secundário.
  const yCortes = textos
    .filter((t) => /^\s*(CORTE|DETALHE|SEÇÃO|SECAO)\b/i.test(String(t.str)))
    .map((t) => t.transform[5]);
  let corteAcimaDe = null;
  if (yCortes.length) {
    const limite = Math.max(...yCortes) + 12; // +12 pt: a altura do próprio rótulo
    // ⚠ só corta se ainda sobrar desenho. Num prancha onde os cortes ficassem ACIMA da vista, ou
    // ao lado, este limite comeria a peça — melhor a folha com cortes do que um recorte vazio.
    const acima = pts.filter(([, y]) => y > limite).length;
    if (acima > pts.length * 0.2) corteAcimaDe = limite;
  }

  const fora = (x, y) => {
    if (corteAcimaDe != null && y <= corteAcimaDe) return true;
    if (x <= reg.margem.esq || x >= reg.margem.dir) return true;
    if (y <= reg.margem.base || y >= reg.margem.topo) return true;
    if (ehFolhaCroqui) return false;
    if (reg.faixaInferior && y <= reg.faixaInferior.y1) return true;
    if (reg.faixaSuperior && y >= reg.faixaSuperior.y0) return true;
    if (x >= reg.carimbo.x0 && y <= reg.carimbo.y1) return true;
    if (x >= reg.lista.x0 && y >= reg.lista.y0) return true;
    return false;
  };
  const dentro = pts.filter(([x, y]) => !fora(x, y));
  if (dentro.length < 30) return null;

  // ⚠ SÓ A VISTA PRINCIPAL, não tudo que sobrou. Sem isto o recorte pegava planta, elevação e
  // corte juntos — "muitas peças que não fazem parte".
  // ⚠ no croqui não se escolhe vista: o que sobra depois das faixas JÁ é a peça (a folha é dela).
  // Escolher ali só dava chance de errar — e errou, pegando a cadeia de cotas.
  // No croqui (A4) o corte é por FAIXA — a folha é da peça e o que atrapalha são os andares de cima
  // e de baixo. No conjunto (A3) é por ilha, porque ali há várias vistas na mesma folha.
  let principal;
  if (ehFolhaCroqui) {
    const faixa = faixaDoDesenho(dentro, reg.margem);
    if (!faixa) return null;
    const naFaixa = dentro.filter(([, y]) => y >= faixa.y0 && y <= faixa.y1);
    if (naFaixa.length < 30) return null;
    const fx = naFaixa.map((q) => q[0]);
    principal = { bb: { left: Math.min(...fx), right: Math.max(...fx), bottom: faixa.y0, top: faixa.y1 } };
  } else {
    principal = vistaPrincipal(dentro, reg.margem);
  }
  if (!principal) return null;

  // texto que pertence à vista escolhida (cotas, "CORTE: A - A", marca da peça): tudo que estiver
  // até 40 pt da caixa dela. Mais longe que isso é legenda de outra vista ou de tabela.
  const bb = { ...principal.bb };
  const perto = 40;
  for (const t of pontosTexto) {
    if (fora(t.x, t.y)) continue;
    if (t.x + t.larg < bb.left - perto || t.x > bb.right + perto) continue;
    if (t.y + t.alt < bb.bottom - perto || t.y > bb.top + perto) continue;
    bb.left = Math.min(bb.left, t.x);
    bb.right = Math.max(bb.right, t.x + t.larg);
    bb.bottom = Math.min(bb.bottom, t.y);
    bb.top = Math.max(bb.top, t.y + t.alt);
  }

  const folga = 10;
  const caixa = {
    left: Math.max(0, bb.left - folga),
    right: Math.min(vp.width, bb.right + folga),
    bottom: Math.max(0, bb.bottom - folga),
    top: Math.min(vp.height, bb.top + folga),
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
  if (!ehFolhaCroqui) {
    tapar(reg.carimbo);
    tapar(reg.lista);
    tapar(reg.esquerda);
  }

  return { bytes: await out.save(), largura: emb.width, altura: emb.height };
}

/**
 * A VISTA EM VETOR, para o navegador desenhar e a pessoa cotar em cima.
 *
 * Vitor (21/08/2026): "seria possível você trazer apenas o desenho sem as cotas e quem for gerar o
 * relatório eu conseguir fazer a cota no desenho específico?"
 *
 * Mandar a geometria em vez de uma imagem resolve o que a imagem não resolve: o clique GRUDA no
 * traço. A pessoa não precisa acertar o pixel — a cota nasce nas coordenadas reais do desenho, que
 * são as mesmas que o PDF usa depois para carimbar a marca. Sem rasterizador e sem escala para
 * adivinhar.
 *
 * ⚠ Roda sobre o RECORTE, não sobre a folha: assim as coordenadas já nascem no espaço da vista que
 * vai para o relatório, e não é preciso repetir (nem arriscar divergir de) a lógica de corte.
 *
 * @param {Buffer|Uint8Array} pdfBytes folha original
 * @param {{min?:number}} opts `min` descarta traço curto demais para se clicar (padrão 1,5 pt)
 * @returns {Promise<{largura:number, altura:number, segs:number[][]}|null>}
 */
export async function vetoresDaVista(pdfBytes, { min = 1.5 } = {}) {
  const vista = await recortarVista(pdfBytes);
  if (!vista?.bytes) return null;

  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const { OPS } = await getResolvedPDFJS();

  let ol, txt;
  try {
    const doc = await getDocumentProxy(new Uint8Array(vista.bytes));
    const pg1 = await doc.getPage(1);
    ol = await pg1.getOperatorList();
    txt = (await pg1.getTextContent()).items.filter((i) => String(i.str).trim());
  } catch { return null; }

  const segs = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha = [];
  const põe = (a, b) => {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < min) return;
    // meio pt de resolução chega para desenhar e clicar, e corta o payload pela metade
    segs.push([Math.round(a[0] * 2) / 2, Math.round(a[1] * 2) / 2, Math.round(b[0] * 2) / 2, Math.round(b[1] * 2) / 2]);
  };
  for (let i = 0; i < ol.fnArray.length; i++) {
    const f = ol.fnArray[i], a = ol.argsArray[i];
    if (f === OPS.save) pilha.push([...ctm]);
    else if (f === OPS.restore) ctm = pilha.pop() || ctm;
    else if (f === OPS.transform) ctm = mul(ctm, a);
    // ⚠ O RECORTE É UM FORM XOBJECT, e ele tem MATRIZ PRÓPRIA.
    //
    // `embedPage` guarda a vista como XObject e a desenha com uma matriz que leva as coordenadas da
    // folha original para a origem do recorte. Sem aplicar essa matriz, todo segmento sai no espaço
    // da folha — e o filtro da vista, em vez de recortar, guardava o pedaço da folha que por acaso
    // caía naquela faixa de números: a lista de materiais e a rosa dos ventos, no canto. Foi o que
    // o Vitor viu na tela ("veio bugado").
    else if (f === OPS.paintFormXObjectBegin) { pilha.push([...ctm]); ctm = mul(ctm, a[0]); }
    else if (f === OPS.paintFormXObjectEnd) { ctm = pilha.pop() || ctm; }
    else if (f === OPS.constructPath) {
      const [ops, args] = a;
      let ai = 0, cur = null;
      for (const op of ops) {
        if (op === OPS.moveTo) { cur = aplicar(ctm, args[ai], args[ai + 1]); ai += 2; }
        else if (op === OPS.lineTo) {
          const p = aplicar(ctm, args[ai], args[ai + 1]); ai += 2;
          if (cur) põe(cur, p);
          cur = p;
        } else if (op === OPS.rectangle) {
          const [x, y, w, h] = args.slice(ai, ai + 4); ai += 4;
          const c = [aplicar(ctm, x, y), aplicar(ctm, x + w, y), aplicar(ctm, x + w, y + h), aplicar(ctm, x, y + h)];
          põe(c[0], c[1]); põe(c[1], c[2]); põe(c[2], c[3]); põe(c[3], c[0]);
          cur = c[0];
        } else if (op === OPS.curveTo) {
          // curva vira corda: para clicar e enxergar, basta
          let p = cur;
          for (let k = 0; k < 3; k++) { p = aplicar(ctm, args[ai], args[ai + 1]); ai += 2; }
          if (cur) põe(cur, p);
          cur = p;
        } else ai += 2;
      }
    }
  }

  // ⚠ SÓ O QUE ESTÁ VISÍVEL. `embedPage` recorta o que se VÊ, mas o fluxo de conteúdo continua com
  // a folha inteira — sem este filtro vinham 3444 segmentos numa vista de 459x369, e o ímã do
  // clique podia grudar num vértice fora da tela, que a pessoa não tem como enxergar nem prever.
  const dentroDaVista = ([x1, y1, x2, y2]) =>
    x1 >= -2 && x1 <= vista.largura + 2 && y1 >= -2 && y1 <= vista.altura + 2 &&
    x2 >= -2 && x2 <= vista.largura + 2 && y2 >= -2 && y2 <= vista.altura + 2;

  // ⚠ traço repetido existe aos montes (o Tekla redesenha contorno por cima); sem tirar, o payload
  // dobra à toa
  const vistos = new Set();
  const unicos = segs.filter(dentroDaVista).filter((s) => { const k = s.join(","); if (vistos.has(k)) return false; vistos.add(k); return true; });

  // ── O TEXTO TAMBÉM VAI ──────────────────────────────────────────────────────────────────────
  //
  // Sem ele a tela mostra o contorno mudo, e quem marca a cota não vê o valor que o projeto já
  // declara — teria de abrir o desenho por fora só para saber o que digitar em "Espec.".
  //
  // ⚠ Mesmo filtro dos traços: o conteúdo do XObject é a folha inteira, e sem recortar viria o
  // carimbo e a lista de materiais junto.
  const textos = txt
    .map((i) => ({
      s: String(i.str),
      x: Math.round(i.transform[4] * 2) / 2,
      y: Math.round(i.transform[5] * 2) / 2,
      t: Math.round((i.height || 6) * 10) / 10,
      // cota vertical vem com o texto girado; a tela precisa girar junto para não sair sobreposta
      v: Math.abs(i.transform[1]) > 0.3 || Math.abs(i.transform[2]) > 0.3,
    }))
    .filter((t) => t.x >= -2 && t.x <= vista.largura + 2 && t.y >= -2 && t.y <= vista.altura + 2);

  return { largura: vista.largura, altura: vista.altura, segs: unicos, textos };
}
