import "server-only";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ETIQUETA DE CARREGAMENTO — a que vai colada na peça, e que hoje sai do BarTender.
//
// Matheus (08/09/2026): "hoje é feito essa emissão utilizando o software BarTender e importamos
// uma planilha com as Marcas e quantidades de cada peça".
//
// ⚠⚠ O TAMANHO NÃO É ESCOLHA, É O ROLO QUE ESTÁ NA MÁQUINA. Etiqueta de 100×50 mm, BOPP
// permanente laranja, numa Argox OS-214 plus (PPLA, 203 dpi) — os dois primeiros dados vieram da
// etiqueta do rolo colada na impressora e o terceiro do cabeçalho do próprio arquivo .btw. A
// página do PDF tem EXATAMENTE 100×50 mm para o driver do Windows não ter o que reinterpretar:
// qualquer margem de página aqui vira etiqueta torta lá.
//
// ⚠ A IMPRESSORA SÓ IMPRIME PRETO. O laranja é o material do rolo, não tinta. Por isso tudo aqui
// é `preto` puro — nada de cinza, que numa térmica de 203 dpi vira pontilhado sujo. E por isso o
// logo é o `torg-logo-etiqueta.png`, chapado e horizontal, e não o `torg-logo.png` do portal, que
// é vertical e tem gradiente azul.

export const MM = 72 / 25.4;                 // 1 mm em pontos PDF
const L = 100 * MM, A = 50 * MM;      // a página: 100 × 50 mm
const PRETO = rgb(0, 0, 0);

/** y do pdf-lib conta de baixo; toda a diagramação abaixo pensa de cima. */
const dy = (mm) => A - mm * MM;
const x = (mm) => mm * MM;

// ── a grade da etiqueta, em mm a partir do canto superior esquerdo ──────────────
// Medida sobre a foto da etiqueta em uso. Mudar aqui muda o desenho inteiro; é o
// único lugar com números de posição.
export const GRADE = {
  borda: 1.2,
  colDir: 75,          // onde começa a coluna da direita (O.P. + QR)
  fimDir: 98.8,
  colQtde: 27,         // largura da coluna QTDE/PESO no rodapé
  fim: 48.8,
  // linhas horizontais, de cima para baixo
  yCabecalho: 15,      // logo + endereço  /  O.P.
  yOP: 8,              // O.P.  /  QR
  yCliente: 24,
  yObra: 33,           // aqui a coluna da direita acaba e a linha atravessa tudo
  yTag: 41.5,
};

const ENDERECO = [
  "AV. MANOEL GONÇALVES NETO, 2680",
  "SÃO JOÃO DA FIGUEIRA - CONCHAL/SP",
  "FONE: (19) 3500 8293",
];

/**
 * @typedef {Object} Peca
 * @property {string} marca        vira o TAG e o conteúdo do QR
 * @property {string} [descricao]
 * @property {number} [qte]        quantas etiquetas — uma por peça, numeradas 001/N
 * @property {number} [pesoUnitKg]
 */

/**
 * Uma página de 100×50 mm por etiqueta.
 * @param {{cliente:string, obra?:string, opNumero:string, pecas:Peca[]}} dados
 * @returns {Promise<Uint8Array>}
 */
export async function gerarEtiquetasCarregamentoPDF({ cliente, obra, opNumero, pecas }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logo = null;
  try {
    logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-etiqueta.png")));
  } catch { /* sem logo a etiqueta ainda serve; sem os dados, não */ }

  for (const peca of pecas) {
    const total = Math.max(1, Number(peca.qte) || 1);
    // Uma etiqueta POR PEÇA, numerada: é o "001/1" da etiqueta atual. Uma marca com 5 peças
    // são 5 adesivos, cada um dizendo qual dos cinco ele é — quem confere no carregamento
    // precisa saber se falta uma.
    const qrs = await Promise.all(
      Array.from({ length: total }, () =>
        QRCode.toBuffer(String(peca.marca ?? ""), { type: "png", margin: 0, width: 320, errorCorrectionLevel: "M" })
      )
    );
    for (let i = 0; i < total; i++) {
      const pg = pdf.addPage([L, A]);
      desenharEtiqueta(pg, {
        cliente, obra, opNumero, peca,
        indice: i + 1, total,
        qr: await pdf.embedPng(qrs[i]),
        font, bold, logo,
      });
    }
  }
  return pdf.save();
}

/**
 * Um pincel já preso à página e às fontes.
 *
 * ⚠ Existe para os ajudantes não carregarem `pg`, `font` e `bold` em toda chamada. A primeira
 * versão passava tudo em cada uma e os ajudantes chegaram a SETE parâmetros — a essa altura a
 * ordem dos argumentos vira o próprio bug.
 */
function pincel(pg, font, bold) {
  const larg = (s, tam, f = font) => f.widthOfTextAtSize(String(s ?? ""), tam) / MM;
  // Duas funções em vez de uma com o parâmetro da fonte no fim: na etiqueta quase tudo é negrito,
  // e `negrito("TAG:", …)` diz na chamada o que `txt("TAG:", …, bold)` só dizia no último argumento.
  const comFonte = (f) => (s, mmX, mmY, tam) =>
    pg.drawText(String(s ?? ""), { x: x(mmX), y: dy(mmY), size: tam, font: f, color: PRETO });
  const txt = comFonte(font), negrito = comFonte(bold);
  return {
    font, bold, larg, txt, negrito,
    linha: (x1, y1, x2, y2) =>
      pg.drawLine({ start: { x: x(x1), y: dy(y1) }, end: { x: x(x2), y: dy(y2) }, thickness: 0.7, color: PRETO }),
    centro: ({ s, entre: [x1, x2], mmY, tam, f = font }) =>
      comFonte(f)(s, (x1 + x2) / 2 - larg(s, tam, f) / 2, mmY, tam),
    // ⚠ yRot e yVal são as LINHAS DE BASE, que crescem para CIMA, e são duas — a primeira versão
    // derivava uma da outra e o CLIENTE saiu desenhado por cima do logo.
    campo: ({ rotulo, valor, mmX, yRot, yVal, tam = 8 }) => {
      negrito(rotulo, mmX, yRot, 4.2);
      negrito(valor, mmX + 1, yVal, tam);
    },
    // Encaixa e desenha de uma vez: quem chama nunca vê o texto que não coube.
    encaixar: ({ s, mmX, mmY, xFim, tamMax, f = bold }) => {
      const r = ajustarTexto(s, f, { xIni: mmX, xFim, tamMax });
      comFonte(f)(r.texto, mmX, mmY, r.tam);
      return r;
    },
    imagem: (img, mmX, mmY, mmL) =>
      pg.drawImage(img, { x: x(mmX), y: dy(mmY), width: x(mmL), height: (img.height / img.width) * mmL * MM }),
  };
}

function moldura(p) {
  const { borda: B, colDir, fimDir, fim, colQtde } = GRADE;
  p.linha(B, B, fimDir, B); p.linha(B, fim, fimDir, fim);
  p.linha(B, B, B, fim); p.linha(fimDir, B, fimDir, fim);
  p.linha(colDir, B, colDir, GRADE.yObra);            // coluna da direita, até a linha cheia
  p.linha(colDir, GRADE.yOP, fimDir, GRADE.yOP);      // O.P. / QR
  p.linha(B, GRADE.yCabecalho, colDir, GRADE.yCabecalho);
  p.linha(B, GRADE.yCliente, colDir, GRADE.yCliente);
  p.linha(B, GRADE.yObra, fimDir, GRADE.yObra);       // atravessa a etiqueta
  p.linha(colQtde, GRADE.yObra, colQtde, fim);
  p.linha(B, GRADE.yTag, fimDir, GRADE.yTag);
}

function cabecalho(p, { opNumero, marca, qr, logo }) {
  const { colDir, fimDir } = GRADE;
  if (logo) p.imagem(logo, 3.5, 8 + ((logo.height / logo.width) * 31) / 2, 31);
  ENDERECO.forEach((l, i) => p.txt(l, colDir - 2 - p.larg(l, 3.5), 4.6 + i * 3.5, 3.5));

  p.negrito("O.P.:", colDir + 1.5, 5.6, 4.2);
  p.negrito(opNumero, colDir + 8.5, 6.1, 7.5);

  const lado = 14;
  p.imagem(qr, colDir + (fimDir - colDir - lado) / 2, GRADE.yOP + 1.5 + lado, lado);
  // A legenda do QR é a célula mais estreita da etiqueta: marca longa é cortada aqui, e não
  // custa nada — a marca inteira está no TAG, em corpo grande.
  const cap = ajustarTexto(marca, p.bold, { xIni: colDir + 1, xFim: fimDir - 1, tamMax: 6 });
  p.centro({ s: cap.texto, entre: [colDir, fimDir], mmY: GRADE.yObra - 1.6, tam: cap.tam, f: p.bold });
}

function corpo(p, { cliente, obra, peca, indice, total }) {
  const { colQtde, fimDir } = GRADE;
  p.campo({ rotulo: "CLIENTE:", valor: cliente, mmX: 3.5, yRot: 19, yVal: 23.2 });
  p.campo({ rotulo: "OBRA:", valor: obra || "—", mmX: 3.5, yRot: 28, yVal: 32.2 });
  p.campo({ rotulo: "QTDE. (PÇ):", valor: `${String(indice).padStart(3, "0")}/${total}`,
            mmX: 3.5, yRot: 36.6, yVal: 40.7, tam: 7.5 });
  p.campo({ rotulo: "PESO (kg):", valor: pesoBR(peca.pesoUnitKg), mmX: 3.5, yRot: 45, yVal: 48.2, tam: 7.5 });

  // TAG é o que se lê de longe no pátio: ocupa a célula inteira.
  p.negrito("TAG:", colQtde + 1.5, 36.6, 4.2);
  p.encaixar({ s: peca.marca, mmX: colQtde + 11, mmY: 40.8, xFim: fimDir - 1.5, tamMax: 15 });

  p.negrito("DESCRIÇÃO:", colQtde + 1.5, 45, 4.2);
  const desc = String(peca.descricao || "").toUpperCase();
  const d = ajustarTexto(desc, p.bold, { xIni: colQtde + 1.5, xFim: fimDir - 1.5, tamMax: 8 });
  p.centro({ s: d.texto, entre: [colQtde, fimDir], mmY: 48.2, tam: d.tam, f: p.bold });
}

function desenharEtiqueta(pg, { cliente, obra, opNumero, peca, indice, total, qr, font, bold, logo }) {
  const p = pincel(pg, font, bold);
  moldura(p);
  cabecalho(p, { opNumero, marca: peca.marca, qr, logo });
  corpo(p, { cliente, obra, peca, indice, total });
}

/**
 * Encaixa um texto ENTRE DUAS COORDENADAS: primeiro diminuindo a fonte, e só se ainda não couber,
 * cortando com reticência.
 *
 * ⚠ A primeira versão recebia a largura como número à parte, e em dois dos três usos esse número
 * não batia com onde o texto realmente começava. Passar `xIni` e `xFim` faz a conta ser a mesma
 * que o desenho: não dá para as duas discordarem.
 *
 * ⚠⚠ ENCOLHER TEM LIMITE, E O TESTE FOI QUEM MOSTROU. A célula sob o QR tem 22 mm; uma marca de
 * 26 caracteres não cabe ali nem a 4 pt — e abaixo disso não se lê mais nada, então diminuir mais
 * seria trocar um defeito visível por um ilegível. Aí o texto é CORTADO. Perder o fim da marca
 * nessa célula não custa: ela é a legenda do QR, e a marca inteira está no TAG, em corpo grande.
 *
 * @param {{xIni:number, xFim:number, tamMax:number, tamMin?:number}} celula limites em mm
 * @returns {{texto:string, tam:number, largura:number, xFim:number}} mm, menos `tam` (pontos)
 */
export function ajustarTexto(texto, fonte, { xIni, xFim, tamMax, tamMin = 4 }) {
  const disponivel = xFim - xIni;
  const mm = (s, tam) => fonte.widthOfTextAtSize(String(s), tam) / MM;
  let s = String(texto ?? "");
  let t = tamMax;
  while (t > tamMin && mm(s, t) > disponivel) t -= 0.25;
  while (s.length > 1 && mm(s, t) > disponivel) s = s.slice(0, -2) + "…";
  return { texto: s, tam: t, largura: mm(s, t), xFim: xIni + mm(s, t) };
}

const pesoBR = (n) =>
  Number.isFinite(Number(n)) && Number(n) > 0
    ? Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
