// A matriz que põe PDF.js e pdf-lib no mesmo sistema de coordenadas.
//
// ⚠⚠ ESTE ARQUIVO EXISTE POR CAUSA DE UM DESENHO QUE VINHA CORTADO (18/09/2026). O viewport do
// PDF.js já vem rotacionado; a operator list, não. Comparar um com o outro descartava em silêncio
// todo traço que passasse da dimensão trocada.
import { describe, it, expect } from "vitest";
import {
  aplicar, inverter, ehIdentidade, caixaParaCru, caixaDoTexto, espacoDaPagina,
  recorteAproveitavel, ESPACO_ATUAL, IDENTIDADE,
} from "@/lib/geometria-pagina";

/**
 * Uma folha de verdade, lida pelo PDF.js de verdade.
 *
 * ⚠ Nada de viewport inventado: o que este arquivo trava é o acordo entre DUAS bibliotecas, e
 * matriz escrita à mão no teste só provaria que eu sei copiar a minha própria conta. Cheguei a
 * fazer isso e a de 270° saiu errada — o teste pegou.
 */
async function espaco(largura, altura, rotate) {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const pg = doc.addPage([largura, altura]);
  if (rotate) pg.setRotation(degrees(rotate));
  const bytes = await doc.save();

  const { getDocumentProxy } = await import("unpdf");
  const lido = await getDocumentProxy(new Uint8Array(bytes));
  return espacoDaPagina(await lido.getPage(1));
}

describe("⚠⚠ sem rotação, a matriz é a IDENTIDADE", () => {
  // ⚠ É a propriedade que torna a correção segura: todo desenho que hoje sai certo não muda.
  it("folha normal não transforma nada", async () => {
    const { M, girada } = await espaco(1191, 842, 0);
    expect(ehIdentidade(M)).toBe(true);
    expect(girada).toBe(false);
  });

  it("e o ponto volta igual", async () => {
    const { M } = await espaco(1191, 842, 0);
    expect(aplicar(M, 150, 300).map(Math.round)).toEqual([150, 300]);
  });
});

describe("a folha girada cai dentro dos limites que o viewport anuncia", () => {
  // ⚠⚠ O CASO MEDIDO: folha 842x1191 com /Rotate 90 vira 1191x842 na tela, e o traço cru ia a
  // y=1151 — acima da altura anunciada (842). Era esse ponto que o filtro jogava fora.
  it("/Rotate 90: o ponto alto em Y cru vira X dentro da largura", async () => {
    const e = await espaco(842, 1191, 90);
    expect([e.largura, e.altura]).toEqual([1191, 842]);
    // y=1151 no espaço cru era exatamente o que o filtro descartava (limite era 842).
    const [x, y] = aplicar(e.M, 100, 1151);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(e.largura);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(e.altura);
  });

  it.each([0, 90, 180, 270])("/Rotate %i: os 4 cantos da folha caem nos 4 cantos do viewport", async (rot) => {
    const e = await espaco(842, 1191, rot);
    const cantos = [[0, 0], [842, 0], [842, 1191], [0, 1191]].map(([x, y]) => aplicar(e.M, x, y));
    const xs = cantos.map((p) => Math.round(p[0])), ys = cantos.map((p) => Math.round(p[1]));
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(Math.round(e.largura));
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(Math.round(e.altura));
  });
});

describe("a inversa devolve o ponto de onde ele veio", () => {
  it.each([0, 90, 180, 270])("ida e volta em /Rotate %i", async (rot) => {
    const { M, inv } = await espaco(842, 1191, rot);
    expect(inv).not.toEqual(null);
    const [x, y] = aplicar(M, 123, 456);
    const [vx, vy] = aplicar(inv, x, y);
    expect(vx).toBeCloseTo(123, 6);
    expect(vy).toBeCloseTo(456, 6);
  });

  it("matriz degenerada não explode — devolve null", () => {
    expect(inverter([0, 0, 0, 0, 0, 0])).toBeNull();
  });
});

describe("⚠⚠ a caixa do recorte converte pelos QUATRO cantos", () => {
  // ⚠⚠ ACHADO DO CODEX: sob 90°, o canto inferior-esquerdo vira o superior-esquerdo. Convertendo
  // só (left,bottom) e (right,top), a caixa sai invertida — e o recorte, vazio ou no lugar errado.
  it.each([90, 270])("/Rotate %i: a caixa crua continua com left<right e bottom<top", async (rot) => {
    const { inv } = await espaco(842, 1191, rot);
    const crua = caixaParaCru({ left: 100, bottom: 50, right: 900, top: 700 }, inv);
    expect(crua.right).toBeGreaterThan(crua.left);
    expect(crua.top).toBeGreaterThan(crua.bottom);
  });

  it("a caixa crua tem a mesma área da caixa escolhida — rotação não encolhe nada", async () => {
    const { inv } = await espaco(842, 1191, 90);
    const caixa = { left: 100, bottom: 50, right: 900, top: 700 };
    const crua = caixaParaCru(caixa, inv);
    const area = (c) => (c.right - c.left) * (c.top - c.bottom);
    expect(area(crua)).toBeCloseTo(area(caixa), 4);
  });

  it("sem rotação, a caixa volta idêntica", () => {
    const caixa = { left: 10, bottom: 20, right: 300, top: 400 };
    const crua = caixaParaCru(caixa, IDENTIDADE);
    expect(crua).toEqual(caixa);
  });
});

describe("⚠⚠ a matriz confere com o PRÓPRIO PDF.js, não só comigo mesmo", () => {
  // ⚠⚠ ACHADO DO CODEX (18/09/2026): os testes de ida-e-volta usam a inversa da implementação que
  // está sendo testada — se `M` e `M⁻¹` estiverem ambas erradas do mesmo jeito, o erro se cancela
  // e o teste passa. Aqui o oráculo é EXTERNO: `convertToViewportPoint` é do próprio PDF.js, a
  // mesma conta que ele usa para renderizar. Se a minha matriz discordar dela, a minha está errada.
  it.each([0, 90, 180, 270])("/Rotate %i: M concorda com convertToViewportPoint", async (rot) => {
    const { PDFDocument, degrees } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const pg = doc.addPage([842, 1191]);
    if (rot) pg.setRotation(degrees(rot));
    const { getDocumentProxy } = await import("unpdf");
    const lido = await getDocumentProxy(new Uint8Array(await doc.save()));
    const pagina = await lido.getPage(1);
    const vp = pagina.getViewport({ scale: 1 });
    const { M } = espacoDaPagina(pagina);

    for (const [x, y] of [[0, 0], [842, 0], [842, 1191], [0, 1191], [123, 456]]) {
      const [vx, vy] = vp.convertToViewportPoint(x, y); // PDF.js: Y para BAIXO
      const [mx, my] = aplicar(M, x, y);                // nosso espaço: Y para CIMA
      expect(mx).toBeCloseTo(vx, 6);
      expect(my).toBeCloseTo(vp.height - vy, 6);
    }
  });
});

describe("a caixa do texto sai dos quatro cantos", () => {
  // ⚠⚠ Texto não avança sempre para a direita. `(x,y) → (x+larg, y+alt)` só vale sem rotação; numa
  // cota vertical ou numa folha girada a caixa crescia para fora do texto, e cota rente à borda
  // continuava sendo cortada (achado do Codex).
  it("texto horizontal: a caixa é o retângulo óbvio", () => {
    const c = caixaDoTexto([1, 0, 0, 1, 100, 200], 50, 10);
    expect(c).toEqual({ left: 100, right: 150, bottom: 200, top: 210 });
  });

  it("⚠⚠ texto girado 90°: a caixa cresce para CIMA, não para a direita", () => {
    // matriz de um texto deitado: avança em +Y, sobe em -X
    const c = caixaDoTexto([0, 1, -1, 0, 100, 200], 50, 10);
    expect(c.bottom).toBeCloseTo(200, 6);
    expect(c.top).toBeCloseTo(250, 6);      // o avanço de 50 foi para cima
    expect(c.right).toBeCloseTo(100, 6);
    expect(c.left).toBeCloseTo(90, 6);      // a altura de 10 foi para a esquerda
  });

  it("texto de cabeça para baixo (180°) cresce para a esquerda e para baixo", () => {
    const c = caixaDoTexto([-1, 0, 0, -1, 100, 200], 50, 10);
    expect(c.right).toBeCloseTo(100, 6);
    expect(c.left).toBeCloseTo(50, 6);
    expect(c.top).toBeCloseTo(200, 6);
    expect(c.bottom).toBeCloseTo(190, 6);
  });

  it("largura ou altura zerada não gera NaN", () => {
    const c = caixaDoTexto([0, 0, 0, 0, 10, 20], 0, 0);
    expect(Object.values(c).every(Number.isFinite)).toBe(true);
  });
});

describe("⚠⚠ recorte gravado sob o contrato antigo não é reaplicado às cegas", () => {
  // ⚠⚠ ACHADO DO CODEX (18/09/2026): "não reinterpretar silenciosamente". Até a correção, a caixa
  // escolhida à mão era entregue CRUA ao `embedPage`, sobre uma folha cuja geometria podia estar
  // truncada. Reaplicá-la agora poria o recorte noutro lugar — e as cotas marcadas em cima dele
  // iriam junto.
  const caixa = { left: 10, bottom: 20, right: 300, top: 400 };
  const semGiro = { girada: false };
  const comGiro = { girada: true };

  it("recorte novo (carimbado) vale em qualquer folha", () => {
    const novo = { ...caixa, espaco: ESPACO_ATUAL };
    expect(recorteAproveitavel(novo, comGiro).ok).toBe(true);
    expect(recorteAproveitavel(novo, semGiro).ok).toBe(true);
  });

  // ⚠ Onde a matriz é identidade os dois contratos COINCIDEM — e é a esmagadora maioria das
  // folhas. Descartar esses recortes seria quebrar o trabalho de quem já enquadrou.
  it("⚠ recorte antigo continua valendo em folha sem giro", () => {
    expect(recorteAproveitavel(caixa, semGiro).ok).toBe(true);
  });

  it("⚠⚠ recorte antigo em folha girada é RECUSADO, com motivo", () => {
    const r = recorteAproveitavel(caixa, comGiro);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/antig/i);
  });

  it("sem recorte nenhum, não há o que aproveitar", () => {
    expect(recorteAproveitavel(null, semGiro).ok).toBe(false);
  });
});
