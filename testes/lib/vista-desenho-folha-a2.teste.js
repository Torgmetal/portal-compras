// ⚠⚠ "PARECE QUE OS DESENHOS ESTÃO FICANDO ZUADO" (Vitor, 23/09/2026, RID-084-001/002 da OP-84).
//
// As colunas de 12 m da OP-84 (T84A2..A5) vêm do Tekla em folha A2, e o recorte automático entregava
// um pedaço da cabeça da coluna (T84A2/A3), um retalho de 65 x 69 pt com os números da cota (T84A5)
// ou o CORTE A-A no lugar da peça (T84A4). O A3 do chumbador (T84A1), no mesmo relatório, saía certo.
// Eram dois defeitos, e os dois vinham de supor o layout do A3:
//
//   1. A DIVISÓRIA DO CARIMBO era "a vertical mais longa da faixa". O carimbo do Tekla tem altura
//      FIXA (~234 pt), mas o desenho cresce com a folha: no A2 uma cota da própria coluna era mais
//      longa, virava a "divisória", e as máscaras de carimbo e lista cobriam tudo à direita dela.
//   2. O RÓTULO "CORTE" cortava a folha na horizontal, supondo os cortes EMBAIXO da vista (T89A3).
//      Nas colunas eles ficam AO LADO, na altura do meio: o limite atravessava a coluna e jogava
//      fora três quartos dela.
//
// Como o outro teste do módulo, a folha é SINTÉTICA — mas com as medidas MEDIDAS nas folhas reais
// (moldura em x 71/1608 e y 28/1128, carimbo com a borda em x=1127 subindo até y=262, lista de
// materiais a partir de y=977). Os PDFs reais ficam no SharePoint; o que importa aqui é a geometria.
import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { recortarVista } from "@/lib/vista-desenho";

const L = 1683.78, A = 1190.55; // A2 deitada, como as folhas da OP-84

/** A folha A2 do Tekla da Torg: moldura, carimbo no canto de baixo e lista no canto de cima. */
async function folhaA2(desenhar) {
  const doc = await PDFDocument.create();
  const pg = doc.addPage([L, A]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const linha = (x1, y1, x2, y2, w = 1) =>
    pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: rgb(0, 0, 0) });
  const texto = (s, x, y, size = 10) => pg.drawText(s, { x, y, size, font: fonte, color: rgb(0, 0, 0) });

  // moldura interna
  linha(71, 28, 1608, 28, 2); linha(1608, 28, 1608, 1128, 2);
  linha(1608, 1128, 71, 1128, 2); linha(71, 1128, 71, 28, 2);
  // carimbo: a borda esquerda NASCE na moldura de baixo e tem a altura fixa do Tekla (234 pt)
  linha(1127, 28, 1127, 262);
  for (const y of [60, 95, 130, 165, 200, 235, 262]) linha(1127, y, 1608, y);
  linha(1484, 28, 1484, 138); linha(1539, 28, 1539, 83);
  // lista de materiais, uma linha a cada 14 pt, com a borda esquerda em trechos
  for (let k = 0; k <= 10; k++) linha(1127, 977 + k * 14, 1608, 977 + k * 14);
  for (let k = 0; k < 10; k++) linha(1127, 977 + k * 14, 1127, 991 + k * 14);

  desenhar(linha, texto);
  return Buffer.from(await doc.save());
}

/**
 * Uma coluna em elevação. As mesas vêm em TRECHOS, interrompidas em cada ligação — é como o Tekla
 * as escreve, e é por isso que nenhum traço dela sozinho passa da altura do carimbo.
 */
function coluna(linha, x0, y0, y1) {
  const quebras = [y0, ...[400, 560, 720].filter((y) => y > y0 && y < y1), y1];
  for (let i = 0; i < quebras.length - 1; i++) {
    linha(x0, quebras[i], x0, quebras[i + 1]);
    linha(x0 + 60, quebras[i], x0 + 60, quebras[i + 1]);
  }
  for (const y of [400, 560, 720].filter((v) => v > y0 && v < y1)) {
    linha(x0 - 15, y, x0 + 75, y); linha(x0 - 15, y + 8, x0 + 75, y + 8);
    linha(x0 - 15, y, x0 - 15, y + 8); linha(x0 + 75, y, x0 + 75, y + 8);
  }
  linha(x0 - 20, y0, x0 + 80, y0, 2); linha(x0, y1, x0 + 60, y1);
}

/** Uma treliça densa — a vista "de verdade", maior que qualquer outra da folha. */
function trelica(linha, x0, y0, x1, y1, n = 20) {
  linha(x0, y0, x1, y0, 2); linha(x0, y1, x1, y1, 2);
  const passo = (x1 - x0) / n;
  for (let k = 0; k < n; k++) {
    const x = x0 + k * passo;
    linha(x, y0, x + passo, y1); linha(x + passo, y0, x, y1);
  }
  // montantes em dois trechos: nenhum traço da peça passa da altura do carimbo
  const meio = (y0 + y1) / 2;
  for (let k = 0; k <= n; k += 5) { const x = x0 + k * passo; linha(x, y0, x, meio); linha(x, meio, x, y1); }
}

/** Um corte: o rótulo em cima, o perfil embaixo dele. */
function corte(linha, texto, nome, x, yTopo) {
  texto(`CORTE: ${nome} - ${nome}`, x, yTopo + 20);
  linha(x, yTopo - 160, x + 140, yTopo - 160); linha(x + 140, yTopo - 160, x + 140, yTopo);
  linha(x + 140, yTopo, x, yTopo); linha(x, yTopo, x, yTopo - 160);
  linha(x + 20, yTopo - 80, x + 120, yTopo - 80); linha(x + 70, yTopo - 150, x + 70, yTopo - 10);
}

describe("⚠⚠ folha A2 da OP-84: a coluna sai inteira", () => {
  // O caso do T84A2: a coluna de 12 m em pé, os cortes AO LADO dela, com o rótulo na altura do
  // meio da coluna. Antes: o limite do rótulo (y≈790) atravessava a coluna e sobrava só a cabeça.
  it("cortes AO LADO da coluna não cortam a coluna", async () => {
    const pdf = await folhaA2((linha, texto) => {
      coluna(linha, 200, 240, 910);
      corte(linha, texto, "A", 1150, 750);
      corte(linha, texto, "B", 1350, 758);
    });
    const r = await recortarVista(pdf);
    expect(r).not.toBeNull();
    // a coluna tem 670 pt de altura; antes vinham ~140 (só o que ficava acima do rótulo)
    expect(r.altura).toBeGreaterThan(600);
    // e é a coluna, não a folha inteira nem os cortes
    expect(r.largura).toBeLessThan(300);
  });

  // O outro defeito: uma cota da própria peça (370 pt, contínua) mais longa que a borda do carimbo
  // (234 pt). Antes ela virava a "divisória", e a máscara do carimbo cobria tudo à direita dela, até
  // a altura dela — a vista saía mutilada. Na METADE DIREITA de propósito: é onde estava a linha
  // que os T89A1/A2 tomavam por divisória (x = 881 e 954), e ali só "nascer na moldura de baixo"
  // separa a cota do carimbo.
  it("uma cota da peça mais longa que o carimbo não vira a divisória", async () => {
    const pdf = await folhaA2((linha) => {
      trelica(linha, 900, 350, 1110, 800);
      linha(870, 350, 870, 720); // a cota da treliça: contínua, 370 pt
    });
    const r = await recortarVista(pdf);
    expect(r).not.toBeNull();
    // a treliça inteira, com a cota: 250 x 450 (+ a folga); antes sobrava a faixa acima de y=722
    expect(r.altura).toBeGreaterThan(430);
    expect(r.largura).toBeGreaterThan(240);
  });

  // O caso do T84A4: o CORTE B-B, à esquerda, desce até a moldura de baixo. Nascer na moldura de
  // baixo não basta para ser o carimbo — ele também tem de estar na metade DIREITA da folha.
  it("vista que desce até a moldura na metade ESQUERDA não vira a divisória", async () => {
    const pdf = await folhaA2((linha) => {
      for (const x of [150, 170, 280, 300]) linha(x, 28, x, 330);
      linha(150, 330, 300, 330);
      trelica(linha, 500, 150, 1000, 700);
    });
    const r = await recortarVista(pdf);
    expect(r).not.toBeNull();
    // a treliça inteira: 500 x 550 (+ a folga); antes a máscara comia o que estava abaixo de y=332
    expect(r.largura).toBeGreaterThan(480);
    expect(r.altura).toBeGreaterThan(530);
  });
});

describe("⚠⚠ o que já saía certo continua saindo igual", () => {
  // A regra do rótulo existe por causa deste layout: vista em cima, cortes EMBAIXO, perto o bastante
  // (40 pt) para o agrupamento juntar os dois. Aqui o limite passa num VAZIO — nenhum traço o
  // atravessa — e tem de continuar cortando.
  const vistaComCorteEmbaixo = (extra) => folhaA2((linha, texto) => {
    trelica(linha, 300, 600, 900, 900);
    corte(linha, texto, "A", 300, 560);
    if (extra) extra(linha);
  });

  it("o corte embaixo continua fora da vista", async () => {
    const r = await recortarVista(await vistaComCorteEmbaixo());
    expect(r).not.toBeNull();
    // só a treliça (300 de altura + a folga); com o corte junto passaria de 480
    expect(r.altura).toBeLessThan(400);
    expect(r.largura).toBeGreaterThan(580);
  });

  // ⚠ UM traço só atravessando o limite não desliga a regra. É o T97A1 medido: uma aresta da
  // VISTA 3D, do lado, cruza a linha — e o recorte dele continua o de antes.
  it("um traço solto atravessando o limite não desliga a regra", async () => {
    const r = await recortarVista(await vistaComCorteEmbaixo((linha) => linha(1050, 500, 1050, 700)));
    expect(r).not.toBeNull();
    expect(r.altura).toBeLessThan(400);
  });

  // ⚠ O desenho da TMSA (RPM-103-001, A3) tem a coluna da direita como UMA caixa, do carimbo até as
  // premissas, escrita em trechos colineares — e a lista de materiais dela mora nessa caixa, entre
  // os trechos. A máscara do carimbo vai até o fim da corrente (y=676); parando no primeiro trecho
  // (y=193) a lista ficava de fora, grudava na vista (26 pt) e a vista inteira passava a "encostar"
  // na moldura — o recorte trocava a planta por um detalhe. Medido na folha real antes e depois.
  it("coluna da direita escrita em trechos (TMSA): a máscara vai até o fim da caixa", async () => {
    const doc = await PDFDocument.create();
    const pg = doc.addPage([1190.55, 841.89]);
    const linha = (x1, y1, x2, y2, w = 1) =>
      pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: rgb(0, 0, 0) });
    linha(71, 28, 1162, 28, 2); linha(1162, 28, 1162, 814, 2); linha(1162, 814, 71, 814, 2); linha(71, 814, 71, 28, 2);
    // a borda da caixa, nos trechos medidos no RPM-103-001
    for (const [a, b] of [[28, 193], [190, 200], [200, 240], [240, 252], [252, 264], [264, 401], [401, 656], [656, 676]]) {
      linha(666, a, 666, b);
    }
    for (const y of [60, 100, 140, 193]) linha(666, y, 1162, y); // carimbo
    for (let y = 205; y <= 397; y += 12) linha(666, y, 1162, y); // lista de materiais
    linha(666, 656, 1162, 656); linha(666, 676, 1162, 676); // premissas
    trelica(linha, 120, 250, 640, 600); // a planta, a 26 pt da caixa
    linha(150, 680, 300, 680); linha(300, 680, 300, 760); linha(300, 760, 150, 760); linha(150, 760, 150, 680); // um detalhe
    linha(170, 700, 280, 740);
    const r = await recortarVista(Buffer.from(await doc.save()));
    expect(r).not.toBeNull();
    // a planta: 520 x 350 (+ a folga); o detalhe tem 150 de largura
    expect(r.largura).toBeGreaterThan(500);
  });
});
