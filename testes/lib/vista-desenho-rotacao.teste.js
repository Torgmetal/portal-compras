// ⚠⚠ O DESENHO VINHA CORTADO, E "AJUSTAR RECORTE" NÃO SALVAVA (Matheus, 18/09/2026).
//
// A causa: PDF.js e pdf-lib não falam o mesmo sistema de coordenadas. `getViewport()` já vem
// rotacionado, `getOperatorList()` não, e `embedPage` também não. Os filtros "está dentro da
// folha?" comparavam um com o outro e descartavam em silêncio o traço que passasse da dimensão
// trocada — a tela de recorte manual já recebia a folha incompleta, e não há retângulo que
// enquadre o que nunca chegou.
//
// Este arquivo trava a cadeia inteira nas quatro orientações. Ele NÃO usa um desenho real (os
// PDFs vivem no SharePoint, atrás de credenciais que não saem da Vercel); usa uma folha sintética
// com marcadores identificáveis nos quatro cantos, que é o que permite dizer se algo SUMIU e se
// foi parar no lugar certo — contar pontos não distingue "girou" de "girou errado".
import { describe, it, expect } from "vitest";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import { vetoresDaPagina, vetoresDaVista, recortarVista } from "@/lib/vista-desenho";
import { espacoDaPagina, aplicar } from "@/lib/geometria-pagina";

const W = 842, H = 1191; // folha CRUA em retrato; com /Rotate 90 ou 270 vira paisagem

// A folha VISUAL usada nos testes de equivalência: A3 deitada, do tamanho de um desenho de verdade.
const VL = 1191, VA = 842;

/**
 * A MESMA folha vista pelo usuário, gravada nas quatro orientações possíveis.
 *
 * ⚠⚠ É ESTE O TESTE QUE VALE. Contar segmentos prova que nada sumiu, mas não prova que o desenho
 * foi parar no lugar certo — 180° preserva as dimensões, e um eixo espelhado passaria batido.
 * Aqui o conteúdo é desenhado em coordenadas VISUAIS e convertido para o espaço cru de cada
 * codificação: o que o usuário vê é idêntico nos quatro casos, então toda saída também tem de ser.
 *
 * ⚠ A matriz inversa é lida do próprio `espacoDaPagina` (criando uma página vazia igual antes),
 * em vez de escrita à mão no teste. Escrevi à mão na primeira tentativa e errei a de 270°.
 */
async function folhaVisual(rotate, desenhar) {
  const cruas = rotate % 180 ? [VA, VL] : [VL, VA];

  const vazia = await PDFDocument.create();
  const pv = vazia.addPage(cruas);
  if (rotate) pv.setRotation(degrees(rotate));
  const { getDocumentProxy } = await import("unpdf");
  const lida = await getDocumentProxy(new Uint8Array(await vazia.save()));
  const { inv } = espacoDaPagina(await lida.getPage(1));

  const doc = await PDFDocument.create();
  const pg = doc.addPage(cruas);
  if (rotate) pg.setRotation(degrees(rotate));
  const paraCru = (x, y) => aplicar(inv, x, y);
  // recebe coordenadas VISUAIS e grava no espaço cru desta codificação
  const linha = (x1, y1, x2, y2, w = 1.5) => {
    const [ax, ay] = paraCru(x1, y1), [bx, by] = paraCru(x2, y2);
    pg.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: w, color: rgb(0, 0, 0) });
  };
  desenhar(linha);
  return Buffer.from(await doc.save());
}

/** Um desenho realista: moldura, carimbo no canto e uma vista densa no meio. */
const desenhoRealista = (linha) => {
  linha(20, 20, VL - 20, 20, 2); linha(VL - 20, 20, VL - 20, VA - 20, 2);
  linha(VL - 20, VA - 20, 20, VA - 20, 2); linha(20, VA - 20, 20, 20, 2);
  // carimbo encostado no canto inferior direito
  for (let k = 0; k <= 5; k++) linha(VL - 340, 20 + k * 26, VL - 20, 20 + k * 26, 1);
  linha(VL - 340, 20, VL - 340, 150, 1);
  // a vista: uma treliça densa, solta no meio da folha
  for (let k = 0; k < 40; k++) {
    const x = 150 + k * 20;
    linha(x, 400, x + 20, 560); linha(x + 20, 400, x, 560);
  }
  linha(150, 400, 950, 400, 2); linha(150, 560, 950, 560, 2);
  linha(150, 370, 950, 370, 1); // linha de cota
};

/**
 * Uma folha com um marcador distinto em cada canto e uma moldura.
 *
 * ⚠ Os marcadores têm tamanhos diferentes de propósito: é assim que se sabe QUAL canto foi parar
 * onde depois da rotação.
 */
async function folha(rotate) {
  const doc = await PDFDocument.create();
  const pg = doc.addPage([W, H]);
  if (rotate) pg.setRotation(degrees(rotate));
  const linha = (x1, y1, x2, y2, w = 2) =>
    pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: rgb(0, 0, 0) });

  // moldura
  linha(30, 30, W - 30, 30); linha(W - 30, 30, W - 30, H - 30);
  linha(W - 30, H - 30, 30, H - 30); linha(30, H - 30, 30, 30);

  // marcadores: um "L" de tamanho diferente em cada canto
  const marcas = [
    { x: 60, y: 60, t: 40 },          // inferior esquerdo
    { x: W - 60, y: 60, t: 60 },      // inferior direito
    { x: W - 60, y: H - 60, t: 80 },  // superior direito
    { x: 60, y: H - 60, t: 100 },     // superior esquerdo
  ];
  for (const m of marcas) {
    linha(m.x, m.y, m.x + (m.x < W / 2 ? m.t : -m.t), m.y, 3);
    linha(m.x, m.y, m.x, m.y + (m.y < H / 2 ? m.t : -m.t), 3);
  }
  // uma peça longa no meio, que é o que "some" quando o eixo é trocado
  for (let k = 0; k < 12; k++) linha(80, 200 + k * 70, W - 80, 200 + k * 70, 1.5);
  return Buffer.from(await doc.save());
}

const ANGULOS = [0, 90, 180, 270];
const dims = (rot) => (rot % 180 ? { largura: H, altura: W } : { largura: W, altura: H });

describe("⚠⚠ a folha inteira chega completa em qualquer orientação", () => {
  // Este é o teste que teria pego o defeito: numa folha girada vinham ZERO segmentos.
  it.each(ANGULOS)("/Rotate %i: nenhum traço é descartado", async (rot) => {
    const base = await vetoresDaPagina(await folha(0));
    const v = await vetoresDaPagina(await folha(rot));
    expect(v).not.toBeNull();
    expect(v.segs.length).toBe(base.segs.length);
  });

  it.each(ANGULOS)("/Rotate %i: a folha é anunciada já orientada", async (rot) => {
    const v = await vetoresDaPagina(await folha(rot));
    const d = dims(rot);
    expect(Math.round(v.largura)).toBe(d.largura);
    expect(Math.round(v.altura)).toBe(d.altura);
  });

  // ⚠ "Está dentro da folha" tem de ser verdade, não uma peneira que joga fora o que não entendeu.
  it.each(ANGULOS)("/Rotate %i: todo traço cai dentro das dimensões anunciadas", async (rot) => {
    const v = await vetoresDaPagina(await folha(rot));
    for (const [x1, y1, x2, y2] of v.segs) {
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        expect(x).toBeGreaterThanOrEqual(-2);
        expect(x).toBeLessThanOrEqual(v.largura + 2);
        expect(y).toBeGreaterThanOrEqual(-2);
        expect(y).toBeLessThanOrEqual(v.altura + 2);
      }
    }
  });

  // ⚠⚠ Quantidade igual não prova orientação certa: 180° preserva as dimensões. O que prova é o
  // traço tocar os quatro cantos — se um eixo tivesse sido espelhado, um lado ficaria vazio.
  it.each(ANGULOS)("/Rotate %i: o desenho ocupa a folha toda, dos dois lados", async (rot) => {
    const v = await vetoresDaPagina(await folha(rot));
    const xs = v.segs.flatMap((s) => [s[0], s[2]]);
    const ys = v.segs.flatMap((s) => [s[1], s[3]]);
    expect(Math.min(...xs)).toBeLessThan(v.largura * 0.1);
    expect(Math.max(...xs)).toBeGreaterThan(v.largura * 0.9);
    expect(Math.min(...ys)).toBeLessThan(v.altura * 0.1);
    expect(Math.max(...ys)).toBeGreaterThan(v.altura * 0.9);
  });
});

describe("⚠⚠ o recorte manual devolve o que foi enquadrado", () => {
  it.each(ANGULOS)("/Rotate %i: pedir a folha inteira devolve a folha inteira", async (rot) => {
    const d = dims(rot);
    const r = await recortarVista(await folha(rot), {
      caixaManual: { left: 0, bottom: 0, right: d.largura, top: d.altura },
    });
    expect(r).not.toBeNull();
    expect(Math.round(r.largura)).toBe(d.largura);
    expect(Math.round(r.altura)).toBe(d.altura);
  });

  // ⚠ Caixa assimétrica: um quadrado no canto tem o mesmo tamanho em qualquer eixo e não denuncia
  // troca de largura por altura. Um retângulo deitado, sim.
  it.each(ANGULOS)("/Rotate %i: caixa assimétrica sai com as medidas pedidas", async (rot) => {
    const d = dims(rot);
    const caixa = { left: 40, bottom: 60, right: 40 + d.largura * 0.6, top: 60 + d.altura * 0.3 };
    const r = await recortarVista(await folha(rot), { caixaManual: caixa });
    expect(Math.round(r.largura)).toBe(Math.round(caixa.right - caixa.left));
    expect(Math.round(r.altura)).toBe(Math.round(caixa.top - caixa.bottom));
  });

  // ⚠⚠ A tela desenha as cotas sobre `largura`/`altura` que a MESMA função devolve. Se o conteúdo
  // recortado saísse girado dentro de uma página com as medidas certas, a cota cairia fora da peça.
  it.each(ANGULOS)("/Rotate %i: o conteúdo recortado vem junto, não fica para trás", async (rot) => {
    const d = dims(rot);
    const caixa = { left: 0, bottom: 0, right: d.largura, top: d.altura };
    const v = await vetoresDaVista(await folha(rot), { caixaManual: caixa });
    expect(v).not.toBeNull();
    const base = await vetoresDaVista(await folha(0), {
      caixaManual: { left: 0, bottom: 0, right: W, top: H },
    });
    // mesma folha, mesmo conteúdo: a contagem de traço não pode cair porque alguém girou o papel
    expect(v.segs.length).toBeGreaterThanOrEqual(Math.round(base.segs.length * 0.9));
  });
});

describe("⚠⚠ a MESMA folha, gravada nas quatro orientações, dá o mesmo resultado", () => {
  // Se o usuário vê a mesma coisa, o portal tem de entregar a mesma coisa. É o teste que não se
  // engana com "girou, mas girou errado".
  it.each(ANGULOS)("/Rotate %i: a folha é anunciada 1191x842 e o traço bate com o de 0°", async (rot) => {
    const base = await vetoresDaPagina(await folhaVisual(0, desenhoRealista));
    const v = await vetoresDaPagina(await folhaVisual(rot, desenhoRealista));
    expect(Math.round(v.largura)).toBe(VL);
    expect(Math.round(v.altura)).toBe(VA);
    expect(v.segs.length).toBe(base.segs.length);
  });

  it.each(ANGULOS)("/Rotate %i: o recorte automático acha a MESMA vista", async (rot) => {
    const base = await recortarVista(await folhaVisual(0, desenhoRealista));
    const r = await recortarVista(await folhaVisual(rot, desenhoRealista));
    expect(base).not.toBeNull();
    expect(r).not.toBeNull();
    // ⚠ tolerância de 2 pt: o agrupamento trabalha numa grade, e o arredondamento da conversão
    // pode mover a borda meio ponto. O que não pode é a vista mudar de tamanho.
    expect(Math.abs(r.largura - base.largura)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.altura - base.altura)).toBeLessThanOrEqual(2);
  });

  // ⚠⚠ O carimbo encosta na moldura; a vista flutua no meio. É esse o sinal que separa os dois, e
  // ele depende de as margens da folha terem sido calculadas no espaço certo.
  it.each(ANGULOS)("/Rotate %i: o recorte não é a folha inteira — o carimbo ficou de fora", async (rot) => {
    const r = await recortarVista(await folhaVisual(rot, desenhoRealista));
    expect(r.largura).toBeLessThan(VL * 0.95);
  });
});

describe("⚠⚠ sem rotação, nada muda", () => {
  // Matheus (18/09/2026), ao aprovar a correção: "importante, só não quebre o formato que já
  // funciona hoje na importação". Estes números foram MEDIDOS rodando o código ANTES da correção,
  // sobre a mesma folha; são característica, não invenção. Se algum deles mudar numa refatoração
  // que deveria preservar comportamento, o errado é a refatoração.
  //
  // ⚠ O que se congela é a GEOMETRIA, não o tamanho do arquivo: o PDF gerado carrega carimbo de
  // data, e o byte varia sem que nada do desenho mude. Medido: antes e depois da correção, o
  // recorte desta folha sai `820 x 210` com os mesmos 83 segmentos — e os arquivos diferiam em
  // 1 byte só por causa do carimbo.
  const antesDaCorrecao = { largura: 820, altura: 210, segs: 83 };

  it("⚠⚠ a folha 0° devolve EXATAMENTE o que devolvia antes da correção", async () => {
    const r = await recortarVista(await folhaVisual(0, desenhoRealista));
    const lido = await vetoresDaPagina(r.bytes);
    expect({ largura: r.largura, altura: r.altura, segs: lido.segs.length })
      .toEqual(antesDaCorrecao);
  });

  it("o recorte automático continua achando a peça", async () => {
    const r = await recortarVista(await folhaVisual(0, desenhoRealista));
    expect(r).not.toBeNull();
    expect(r.largura).toBeGreaterThan(0);
  });

  it("recorte manual sem rotação devolve exatamente a caixa pedida", async () => {
    const caixa = { left: 100, bottom: 200, right: 700, top: 900 };
    const r = await recortarVista(await folha(0), { caixaManual: caixa });
    expect(Math.round(r.largura)).toBe(600);
    expect(Math.round(r.altura)).toBe(700);
  });
});

describe("⚠⚠ moldura desenhada como RETÂNGULO, não como quatro linhas", () => {
  // ⚠⚠ ACHADO DO CODEX (18/09/2026): a correção fez `verticais`/`horizontais` emitirem os QUATRO
  // lados de um `rectangle` — e nenhum teste cobria isso, porque as folhas sintéticas desenhavam a
  // moldura com linhas soltas. Um desenho de verdade costuma usar o operador `rectangle`, e é dele
  // que sai a moldura que `regioes` usa para separar carimbo e lista da peça.
  async function lados(rotate) {
    const { PDFDocument, degrees, rgb: cor } = await import("pdf-lib");
    const { verticais, horizontais } = await import("@/lib/campos-desenho");
    const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");

    const cruas = rotate % 180 ? [VA, VL] : [VL, VA];
    const doc = await PDFDocument.create();
    const pg = doc.addPage(cruas);
    if (rotate) pg.setRotation(degrees(rotate));
    // UM retângulo, do jeito que o CAD escreve: operador `re`, não quatro `l`
    pg.drawRectangle({ x: 40, y: 40, width: cruas[0] - 80, height: cruas[1] - 80,
      borderWidth: 2, borderColor: cor(0, 0, 0) });

    const lido = await getDocumentProxy(new Uint8Array(await doc.save()));
    const pagina = await lido.getPage(1);
    const { OPS } = await getResolvedPDFJS();
    const ol = await pagina.getOperatorList();
    const { M } = espacoDaPagina(pagina);
    return { v: verticais(ol, OPS, M), h: horizontais(ol, OPS, M) };
  }

  it.each(ANGULOS)("/Rotate %i: os dois lados verticais e os dois horizontais são achados", async (rot) => {
    const { v, h } = await lados(rot);
    // ⚠ Antes da correção, sob 90/270 um dos dois vinha ZERADO: o lado vertical cru vira
    // horizontal na folha orientada, e o detector filtrava pelos lados crus.
    expect(v.length).toBeGreaterThanOrEqual(2);
    expect(h.length).toBeGreaterThanOrEqual(2);
  });

  it.each(ANGULOS)("/Rotate %i: a moldura achada tem o tamanho da folha orientada", async (rot) => {
    const { v, h } = await lados(rot);
    const larguraMoldura = Math.max(...v.map((l) => l.x)) - Math.min(...v.map((l) => l.x));
    const alturaMoldura = Math.max(...h.map((l) => l.y)) - Math.min(...h.map((l) => l.y));
    expect(Math.round(larguraMoldura)).toBe(VL - 80);
    expect(Math.round(alturaMoldura)).toBe(VA - 80);
  });
});

describe("⚠⚠ caminho fechado (`closePath`) não perde o lado de fechamento", () => {
  // ⚠⚠ ACHADO AO ESCREVER O TESTE DO RETÂNGULO (18/09/2026), e independente de rotação: o pdf-lib
  // — e vários CADs — escrevem um retângulo como `moveTo lineTo lineTo lineTo closePath`, sem usar
  // o operador `rectangle`. `closePath` não era tratado, então:
  //   1. o lado de FECHAMENTO sumia — medido, 3 retângulos davam 9 segmentos em vez de 12;
  //   2. o `else ai += 2` consumia dois argumentos que `closePath` não tem, dessincronizando as
  //      coordenadas de tudo que viesse depois no MESMO traçado.
  // Isto valia em folha `/Rotate 0` também. É outro caminho para "o desenho vem incompleto".
  async function folhaComRetangulos(rotate = 0) {
    const { PDFDocument, degrees, rgb: cor } = await import("pdf-lib");
    const cruas = rotate % 180 ? [VA, VL] : [VL, VA];
    const doc = await PDFDocument.create();
    const pg = doc.addPage(cruas);
    if (rotate) pg.setRotation(degrees(rotate));
    pg.drawRectangle({ x: 40, y: 40, width: cruas[0] - 80, height: cruas[1] - 80, borderWidth: 2, borderColor: cor(0,0,0) });
    pg.drawRectangle({ x: 100, y: 100, width: 240, height: 120, borderWidth: 1, borderColor: cor(0,0,0) });
    pg.drawRectangle({ x: 400, y: 300, width: 200, height: 150, borderWidth: 1, borderColor: cor(0,0,0) });
    return Buffer.from(await doc.save());
  }

  it("três retângulos dão os 12 lados — não 9", async () => {
    const v = await vetoresDaPagina(await folhaComRetangulos(0));
    expect(v.segs.length).toBe(12);
  });

  it.each(ANGULOS)("/Rotate %i: continua 12, gire como girar", async (rot) => {
    const v = await vetoresDaPagina(await folhaComRetangulos(rot));
    expect(v.segs.length).toBe(12);
  });

  // ⚠ O pior dos dois defeitos: coordenada dessincronizada não some, vai parar longe — e o filtro
  // "está dentro da folha?" a descarta em silêncio, levando junto traço legítimo.
  it("nenhum traço cai fora da folha depois de um caminho fechado", async () => {
    const v = await vetoresDaPagina(await folhaComRetangulos(0));
    for (const [x1, y1, x2, y2] of v.segs) {
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        expect(x).toBeGreaterThanOrEqual(-2);
        expect(x).toBeLessThanOrEqual(v.largura + 2);
        expect(y).toBeGreaterThanOrEqual(-2);
        expect(y).toBeLessThanOrEqual(v.altura + 2);
      }
    }
  });
});
