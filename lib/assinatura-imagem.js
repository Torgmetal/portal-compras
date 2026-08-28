// Preparo da IMAGEM DA ASSINATURA no navegador, antes de subir.
//
// ⚠⚠ O QUE CHEGA É UMA FOTO DE PAPEL, não um arquivo pronto. A assinatura do Geraldo veio como foto
// do carimbo sobre uma folha: 2268×4032, deitada, papel cinza com sombra e clarão de flash. Colada
// assim no PDF, o campo de assinatura ganha um retângulo cinza torto no meio de um documento
// controlado.
//
// Então o navegador faz o serviço: gira, separa TRAÇO de PAPEL, recorta no traço e reduz. O que
// sobe é um PNG pequeno de fundo transparente, que pousa sobre a linha em vez de tampá-la.
//
// ⚠ O CORTE É LOCAL, não global. Um corte único de luminância não funciona em foto de papel: a
// sombra de um canto é mais escura que a tinta do outro — com corte fixo, ou some a assinatura ou
// sobe a folha inteira. Compara-se cada pixel com a MÉDIA DA VIZINHANÇA (a folha reduzida 32× e
// reampliada é essa média). É assim que scanner limpa página.

/** Lê o arquivo como <img>. Erro claro quando o navegador não sabe decodificar (HEIC de iPhone). */
function carregar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(/heic|heif/i.test(`${file.name || ""} ${file.type || ""}`)
        ? "Este navegador não abre HEIC (foto de iPhone). Converta para JPG ou PNG e tente de novo."
        : "Não consegui abrir esta imagem."));
    };
    img.src = url;
  });
}

/**
 * Gira, limpa o fundo, recorta no traço e devolve um PNG com fundo transparente.
 * @param {File} file
 * @param {{ rotacao?: 0|90|180|270, forca?: number, maxLargura?: number }} opts
 *   forca = quanto o pixel precisa ser mais escuro que a vizinhança para virar traço. Menor pega
 *   traço fraco (e mais sujeira); maior só pega o bem escuro. 18 serve para foto de celular.
 * @returns {Promise<Blob>}
 */
export async function prepararAssinatura(file, { rotacao = 0, forca = 18, maxLargura = 900 } = {}) {
  const img = await carregar(file);

  // 1) girar
  const vira = rotacao === 90 || rotacao === 270;
  const lg = vira ? img.height : img.width;
  const al = vira ? img.width : img.height;
  const c1 = document.createElement("canvas");
  c1.width = lg; c1.height = al;
  const x1 = c1.getContext("2d", { willReadFrequently: true });
  x1.save();
  x1.translate(lg / 2, al / 2);
  x1.rotate((rotacao * Math.PI) / 180);
  x1.drawImage(img, -img.width / 2, -img.height / 2);
  x1.restore();

  // 2) média da vizinhança: reduz 32× e reamplia (borrão barato)
  const cm = document.createElement("canvas");
  cm.width = Math.max(1, lg >> 5); cm.height = Math.max(1, al >> 5);
  cm.getContext("2d").drawImage(c1, 0, 0, cm.width, cm.height);
  const cb = document.createElement("canvas");
  cb.width = lg; cb.height = al;
  const xb = cb.getContext("2d", { willReadFrequently: true });
  xb.imageSmoothingEnabled = true;
  xb.drawImage(cm, 0, 0, lg, al);
  const media = xb.getImageData(0, 0, lg, al).data;

  // 3) traço = mais escuro que a vizinhança; o resto vira transparente
  const d = x1.getImageData(0, 0, lg, al);
  const px = d.data;
  const linhas = new Uint32Array(al), colunas = new Uint32Array(lg);
  for (let y = 0; y < al; y++) {
    for (let x = 0; x < lg; x++) {
      const i = (y * lg + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const med = 0.299 * media[i] + 0.587 * media[i + 1] + 0.114 * media[i + 2];
      if (lum > med - forca) { px[i + 3] = 0; continue; }
      const k = Math.max(0, Math.min(1, lum / Math.max(1, med))); // firma o contraste do traço
      px[i] = Math.round(px[i] * k); px[i + 1] = Math.round(px[i + 1] * k); px[i + 2] = Math.round(px[i + 2] * k);
      px[i + 3] = 255;
      linhas[y]++; colunas[x]++;
    }
  }
  x1.putImageData(d, 0, 0);

  // 4) recorte por DENSIDADE, não pelo primeiro pixel escuro — um respingo de sujeira num canto
  // faria o recorte pegar a folha inteira, e a assinatura sairia perdida no meio de margem branca.
  const minL = Math.max(3, Math.round(lg * 0.004));
  const minC = Math.max(3, Math.round(al * 0.004));
  let y0 = -1, y2 = -1, x0 = -1, x2 = -1;
  for (let y = 0; y < al; y++) if (linhas[y] >= minL) { if (y0 < 0) y0 = y; y2 = y; }
  for (let x = 0; x < lg; x++) if (colunas[x] >= minC) { if (x0 < 0) x0 = x; x2 = x; }
  if (y0 < 0 || x0 < 0) { x0 = 0; y0 = 0; x2 = lg - 1; y2 = al - 1; } // nada reconhecível: sobe a folha
  const folga = Math.round(Math.max(lg, al) * 0.012);
  x0 = Math.max(0, x0 - folga); y0 = Math.max(0, y0 - folga);
  x2 = Math.min(lg - 1, x2 + folga); y2 = Math.min(al - 1, y2 + folga);
  const cw = x2 - x0 + 1, ch = y2 - y0 + 1;

  // 5) reduzir
  const esc = Math.min(1, maxLargura / cw);
  const c2 = document.createElement("canvas");
  c2.width = Math.max(1, Math.round(cw * esc));
  c2.height = Math.max(1, Math.round(ch * esc));
  const x2d = c2.getContext("2d");
  x2d.imageSmoothingQuality = "high";
  x2d.drawImage(c1, x0, y0, cw, ch, 0, 0, c2.width, c2.height);

  return new Promise((res, rej) => c2.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar a imagem."))), "image/png"));
}
