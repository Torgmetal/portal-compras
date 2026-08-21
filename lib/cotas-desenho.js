import "server-only";
import { verticais, horizontais } from "./campos-desenho";

// AS COTAS PRINCIPAIS DE UM DESENHO DE CONJUNTO.
//
// Vitor (21/08/2026) marcou de verde, no T89A3, as cotas que a inspeção mede — e depois nomeou:
//
//   4332      altura total
//   1771      largura
//   210 × 210 largura da chapa
//   4187      largura total da vista
//
// A regra que sai daí: por VISTA e por EIXO, vale a CADEIA MAIS EXTERNA, e dela o total. Nem todas
// as cotas — "preciso tirar esse monte de cotas, precisamos de cotas específicas".
//
// ⚠ O total nem sempre é um número escrito. Às vezes o desenho traz a cota cheia (4332) e às vezes
// só a cadeia de parciais (29 + 76 + 76 + 29 na chapa de base, que dá 210). Por isso o total é o
// MAIOR valor da cadeia quando ele existe, e a SOMA quando a cadeia só tem parciais.
//
// ⚠ Cota vertical vem com o texto GIRADO — é assim que se separa altura de largura no PDF, já que
// não há rótulo dizendo qual é qual. A matriz de transformação do texto denuncia a rotação.

const RX_NUM = /^\d{1,5}$/;

/** O texto está girado? (cota de altura, escrita na vertical) */
const girado = (t) => Math.abs(t[1]) > 0.3 || Math.abs(t[2]) > 0.3;

/**
 * Agrupa cotas que estão na mesma linha de cota (mesma coluna, se vertical; mesma altura, se
 * horizontal). Tolerância de 12 pt — o Tekla desalinha alguns décimos entre os números da cadeia.
 */
function cadeias(cotas, eixo, tol = 12) {
  const gs = [];
  for (const c of [...cotas].sort((a, b) => a[eixo] - b[eixo])) {
    const g = gs.find((g) => Math.abs(g.pos - c[eixo]) <= tol);
    if (g) { g.itens.push(c); g.pos = (g.pos * (g.itens.length - 1) + c[eixo]) / g.itens.length; }
    else gs.push({ pos: c[eixo], itens: [c] });
  }
  return gs;
}

/**
 * O total de uma cadeia.
 *
 * ⚠ Se o maior valor for próximo da soma dos outros, ele É o total (o desenho trouxe a cota cheia
 * junto das parciais) — somar tudo dobraria a medida. Senão, a cadeia é só de parciais e o total é
 * a soma.
 */
function totalDaCadeia(vals) {
  if (!vals.length) return null;
  const maior = Math.max(...vals);
  const resto = vals.filter((v) => v !== maior).reduce((a, b) => a + b, 0);
  if (resto === 0) return maior;
  const soma = vals.reduce((a, b) => a + b, 0);
  return Math.abs(maior - resto) / Math.max(maior, 1) < 0.12 ? maior : soma;
}

/**
 * Lê as cotas principais de um desenho.
 *
 * @param {Buffer|Uint8Array} pdfBytes
 * @param {{minima?:number}} opts `minima` descarta detalhe pequeno (padrão 100 mm)
 * @returns {Promise<{principais:Array<{eixo,valor,x,y,itens}>, todas:number[]}|null>}
 */
export async function lerCotasPrincipais(pdfBytes, { minima = 100 } = {}) {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const { OPS } = await getResolvedPDFJS();

  let pg, itens, vp, ol;
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdfBytes));
    pg = await doc.getPage(1);
    itens = (await pg.getTextContent()).items.filter((i) => String(i.str).trim());
    vp = pg.getViewport({ scale: 1 });
    ol = await pg.getOperatorList();
  } catch { return null; }

  // moldura interna, para descartar as tabelas laterais e o carimbo
  const vs = verticais(ol, OPS), hs = horizontais(ol, OPS);
  const xsF = [...new Set(vs.filter((v) => v.y2 - v.y1 > vp.height * 0.8).map((v) => Math.round(v.x)))];
  const ysF = [...new Set(hs.filter((h) => h.x2 - h.x1 > vp.width * 0.8).map((h) => Math.round(h.y)))];
  const esq = Math.max(...xsF.filter((x) => x < vp.width / 2), vp.width * 0.02) + 6;
  const dir = Math.min(...xsF.filter((x) => x > vp.width / 2), vp.width * 0.98) - 6;
  const base = Math.max(...ysF.filter((y) => y < vp.height / 2), vp.height * 0.02) + 6;
  const topo = Math.min(...ysF.filter((y) => y > vp.height / 2), vp.height * 0.98) - 6;

  const cotas = itens
    .filter((i) => RX_NUM.test(String(i.str).trim()))
    .map((i) => ({
      v: parseInt(i.str, 10),
      x: i.transform[4], y: i.transform[5],
      larg: i.width || 0, alt: i.height || 8,
      vertical: girado(i.transform),
    }))
    .filter((c) => c.x > esq && c.x < dir && c.y > base && c.y < topo);

  if (!cotas.length) return null;

  // ── PRIMEIRO SEPARA AS VISTAS ───────────────────────────────────────────────────────────────
  //
  // Sem isso a cadeia se mistura entre desenhos: no T89A3 a altura da vista lateral (4187) caía
  // junto com a largura do corte (1771) e dava 6103. As vistas ficam longe umas das outras na
  // folha, então basta agrupar as próprias cotas por proximidade.
  const vistas = [];
  const raio = 150;
  for (const c of cotas) {
    const v = vistas.find((v) => c.x >= v.x0 - raio && c.x <= v.x1 + raio && c.y >= v.y0 - raio && c.y <= v.y1 + raio);
    if (v) {
      v.itens.push(c);
      v.x0 = Math.min(v.x0, c.x); v.x1 = Math.max(v.x1, c.x);
      v.y0 = Math.min(v.y0, c.y); v.y1 = Math.max(v.y1, c.y);
    } else vistas.push({ x0: c.x, x1: c.x, y0: c.y, y1: c.y, itens: [c] });
  }
  // junta vistas que se tocaram depois de crescer (a varredura é numa passada só)
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (let i = 0; i < vistas.length && !mudou; i++) {
      for (let j = i + 1; j < vistas.length; j++) {
        const a = vistas[i], b = vistas[j];
        if (a.x0 - raio <= b.x1 && b.x0 - raio <= a.x1 && a.y0 - raio <= b.y1 && b.y0 - raio <= a.y1) {
          a.itens.push(...b.itens);
          a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1);
          a.y0 = Math.min(a.y0, b.y0); a.y1 = Math.max(a.y1, b.y1);
          vistas.splice(j, 1); mudou = true; break;
        }
      }
    }
  }

  const principais = [];
  for (const vista of vistas) {
  for (const [vertical, eixo] of [[true, "x"], [false, "y"]]) {
    const doEixo = vista.itens.filter((c) => c.vertical === vertical);
    const gs = cadeias(doEixo, eixo).filter((g) => g.itens.length >= 2);
    for (const g of gs) {
      const total = totalDaCadeia(g.itens.map((i) => i.v));
      if (total == null || total < minima) continue;
      // a cota que REPRESENTA a cadeia: a de maior valor (é nela que o destaque vai)
      const alvo = g.itens.reduce((m, i) => (i.v > m.v ? i : m), g.itens[0]);
      principais.push({
        eixo: vertical ? "altura" : "largura",
        valor: total,
        // posição do texto que será destacado no desenho
        x: alvo.x, y: alvo.y, larg: alvo.larg, alt: alvo.alt,
        parciais: g.itens.sort((a, b) => (vertical ? a.y - b.y : a.x - b.x)).map((i) => i.v),
      });
    }
  }
  }

  // ⚠ cadeia repetida existe (o desenho cota a mesma altura dos dois lados). Fica uma só.
  const vistos = new Set();
  const unicas = principais
    .sort((a, b) => b.valor - a.valor)
    .filter((p) => { const k = `${p.eixo}|${p.valor}`; if (vistos.has(k)) return false; vistos.add(k); return true; });

  return { principais: unicas, todas: [...new Set(cotas.map((c) => c.v))].sort((a, b) => b - a) };
}
