import "server-only";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  A, ENDERECO, L, MM, ajustarTexto, contagemDaEtiqueta, numeroDaEtiqueta, pesoBR, pincel,
} from "@/lib/etiqueta-pdf-base";
import { desenharEtiquetaQws } from "@/lib/etiqueta-qws-pdf";

// ETIQUETA DE CARREGAMENTO — a que vai colada na peça, e que hoje sai do BarTender.
//
// Matheus (08/09/2026): "hoje é feito essa emissão utilizando o software BarTender e importamos
// uma planilha com as Marcas e quantidades de cada peça".
//
// O tamanho do rolo, a impressora, as fontes e o jeito de escrever moram em `etiqueta-pdf-base.js`
// — são os mesmos em todo modelo. Aqui ficam o MODELO PADRÃO e a escolha de qual desenhar.

export { MM, ajustarTexto, contagemDaEtiqueta, numeroDaEtiqueta };

// ── a grade do MODELO PADRÃO, em mm a partir do canto superior esquerdo ──────────
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

/**
 * Os modelos que existem. Quem imprime escolhe na tela.
 *
 * ⚠ O MODELO É POR IMPRESSÃO, NÃO POR CLIENTE CADASTRADO. Amarrar o desenho ao nome do cliente
 * pareceria mais esperto, mas a mesma obra pode precisar dos dois (uma peça que fica na fábrica,
 * uma que vai para o cliente) e um cliente novo com a mesma exigência viraria um `if` novo aqui.
 */
export const MODELOS = ["padrao", "qws"];

/**
 * @typedef {Object} Peca
 * @property {string} marca        vira o TAG e o conteúdo do QR
 * @property {string} [descricao]
 * @property {number} [qte]        quantas etiquetas — uma por peça, numeradas 001/N
 * @property {number} [pesoUnitKg]
 * @property {string} [referencia]     modelo QWS — referência do desenho do cliente
 * @property {string} [tagPetrobras]   modelo QWS — o código por onde o cliente confere
 * @property {string} [descricaoQws]   modelo QWS — a posição do desenho ("SE-001")
 */

/**
 * Uma página de 100×50 mm por etiqueta.
 * @param {{cliente:string, obra?:string, opNumero:string, pecas:Peca[], modelo?:string}} dados
 * @returns {Promise<Uint8Array>}
 */
export async function gerarEtiquetasCarregamentoPDF({ cliente, obra, opNumero, pecas, modelo = "padrao" }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // ⚠ Modelo desconhecido cai no padrão em vez de estourar: o pior caso é sair a etiqueta de
  // sempre, que é o que saía antes de existir modelo nenhum.
  const desenhar = modelo === "qws" ? desenharEtiquetaQws : desenharEtiqueta;

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
      desenhar(pg, {
        cliente, obra, opNumero, peca,
        indice: i + 1, total,
        qr: await pdf.embedPng(qrs[i]),
        font, bold, logo,
      });
    }
  }
  return pdf.save();
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
  // 37 mm: medido sobre a foto da etiqueta em uso, onde o logo vai até pouco antes do endereço.
  // Com 31 ele ficava visivelmente menor que o original.
  const LOGO = 37;
  if (logo) p.imagem(logo, 3.5, 8 + ((logo.height / logo.width) * LOGO) / 2, LOGO);
  ENDERECO.forEach((l, i) => p.txt(l, colDir - 2 - p.larg(l, 3.5), 4.6 + i * 3.5, 3.5));

  p.negrito("O.P.:", colDir + 1.5, 5.6, 4.2);
  p.negrito(numeroDaEtiqueta(opNumero), colDir + 8.5, 6.1, 7.5);

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
  p.campo({ rotulo: "QTDE. (PÇ):", valor: contagemDaEtiqueta(indice, total),
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
