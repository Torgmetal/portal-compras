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
 * PEDE AO VISUALIZADOR QUE NÃO REDIMENSIONE, E QUE ESCOLHA O PAPEL PELO TAMANHO DA PÁGINA.
 *
 * ⚠⚠ ISTO É UM PEDIDO, NÃO UMA GARANTIA — e o caso real que motivou o pedido não foi resolvido por
 * ele. Matheus (10/09/2026) imprimiu e a etiqueta saiu DEITADA, esticada por três etiquetas do
 * rolo. A causa estava no diálogo do Windows: papel **"4 x 6"** (101,6 × 152,4 mm, retrato) e escala
 * **"Ajustar à área de impressão"**. O Chrome então gira a página de 100×50 (deitada) para caber
 * num papel em pé e a estica até preencher. O PDF estava certo o tempo todo.
 *
 * `PrintScaling /None` diz "não ajuste"; `PickTrayByPDFSize` diz "escolha a mídia pelo tamanho da
 * página". Os dois são do padrão PDF e alguns visualizadores honram — mas **nenhum sobrepõe uma
 * mídia de 4×6 configurada no driver da impressora**. O conserto de verdade é no driver da Argox, e
 * está escrito na tela (`EtiquetasClient.jsx`), que é onde a pessoa está na hora de errar.
 *
 * Fica aqui porque custa três linhas e melhora o caso em que o driver JÁ está certo: sem
 * `PrintScaling /None`, um "ajustar à página" lembrado da última impressão volta a estragar.
 */
function pedirImpressaoSemAjuste(pdf) {
  const prefs = pdf.catalog.getOrCreateViewerPreferences();
  prefs.setPrintScaling("None");
  prefs.setPickTrayByPDFSize(true);
}

/**
 * DESLOCA O DESENHO INTEIRO, para compensar a origem de impressão da máquina.
 *
 * ⚠⚠ ISTO É CONSERTO DE MÁQUINA, NÃO DESIGN. O desenho vai de 1,2 a 98,8 mm numa página de 100 —
 * está centrado. Se sai cortado, a origem da Argox está deslocada, e o lugar certo de corrigir é o
 * driver. Matheus (11/09/2026): "minha etiqueta ainda está saindo bem para esquerda a impressão aí
 * fica cortando". Existe porque o driver da Argox nem sempre expõe esse ajuste, e sem isto a
 * expedição fica sem saída nenhuma.
 *
 * ⚠⚠ DESLOCAR SOZINHO NÃO SERVE, E É O PONTO TODO. A página tem 100 mm e o desenho já usa
 * 1,2–98,8: empurrar 5 mm para a direita jogaria a coluna do QR para fora do papel — trocaria o
 * corte da esquerda pelo corte da direita. Por isso o desenho também ENCOLHE, o bastante para o
 * que sobra caber. A 5 mm o encolhimento é de 5% — imperceptível ao lado de perder a borda.
 *
 * ⚠ `scaleContent` ancora no canto INFERIOR esquerdo. Escalar e depois "descer" empurra o rodapé
 * para fora da página; medido num quadro de referência antes de entrar aqui. O deslocamento
 * vertical é calculado a partir do TOPO: `(A - dy) - A*escala`.
 */
export function transformeDaCalibragem({ deslocX = 0, deslocY = 0 } = {}) {
  const dx = Number(deslocX) || 0;
  const dy = Number(deslocY) || 0;
  if (!dx && !dy) return null;
  const escala = Math.min((100 - Math.abs(dx)) / 100, (50 - Math.abs(dy)) / 50);
  // ⚠⚠ PARA A ESQUERDA NÃO É `tx` NEGATIVO. Isso jogaria o desenho para fora do papel — o mesmo
  // corte que a calibragem existe para resolver, só que do outro lado. Indo para a esquerda, o
  // desenho ENCOSTA na borda (tx = 0) e encolhe: a folga toda passa para a direita, e o efeito
  // visto no adesivo é o conteúdo andar para a esquerda. Mesma ideia na vertical.
  const esquerda = Math.max(0, dx);
  const topo = Math.max(0, dy);
  // ⚠ `ty` é medido a partir do TOPO. `scaleContent` ancora EMBAIXO; "descer" ingenuamente
  // (ty = -dy) empurra o rodapé para fora — foi o que a primeira tentativa fez, visto num quadro
  // de referência renderizado antes de isto entrar no gerador.
  return { escala, tx: esquerda, ty: (50 - topo) - 50 * escala };
}

export function calibrar(pg, calibragem) {
  const t = transformeDaCalibragem(calibragem);
  if (!t) return;
  pg.scaleContent(t.escala, t.escala);
  pg.translateContent(t.tx * MM, t.ty * MM);
}

/**
 * Uma página de 100×50 mm por etiqueta.
 * @param {{cliente:string, obra?:string, opNumero:string, pecas:Peca[], modelo?:string}} dados
 * @returns {Promise<Uint8Array>}
 */
export async function gerarEtiquetasCarregamentoPDF({ cliente, obra, tagObra, opNumero, pecas, modelo = "padrao", calibragem }) {
  const pdf = await PDFDocument.create();
  pedirImpressaoSemAjuste(pdf);
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
        cliente, obra, tagObra, opNumero, peca,
        indice: i + 1, total,
        qr: await pdf.embedPng(qrs[i]),
        font, bold, logo,
      });
      // ⚠ DEPOIS de desenhar: a calibragem transforma o conteúdo já pronto, não as coordenadas.
      // Aplicada antes, cada `drawText` viria por cima da transformação e o efeito seria outro.
      calibrar(pg, calibragem);
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

/**
 * A OBRA com a TAG do cliente na frente.
 *
 * ⚠⚠ A TAG É POR IMPRESSÃO, DIGITADA NA TELA — não vem do cadastro. Matheus (11/09/2026): "preciso
 * que tenha uma opção nas etiquetas padrão Torg para inserir uma TAG manualmente que se repita em
 * todas as etiquetas na frente do nome da OBRA, exemplo na OP 103 preciso colocar a tag TPR00870".
 * É um código do CLIENTE para aquele embarque; o portal não tem de onde saber qual é, e criar um
 * campo no cadastro da OP obrigaria a engenharia a preenchê-lo em toda obra que não usa.
 *
 * ⚠ SEPARADOR " | ", NÃO HÍFEN. Mesma lição que a TAG/DESCRIÇÃO do modelo QWS custou (10/09/2026:
 * "ficou T102A1-SE-001, parece um negócio só"): hífen entre dois códigos de origens diferentes funde
 * os dois num terceiro que não existe em lugar nenhum.
 */
const obraComTag = (tagObra, obra) =>
  [tagObra, obra].map((s) => String(s ?? "").trim()).filter(Boolean).join(" | ") || "—";

function corpo(p, { cliente, obra, tagObra, peca, indice, total }) {
  const { colDir, colQtde, fimDir } = GRADE;
  // ⚠⚠ CLIENTE E OBRA PASSAM A SER ENCAIXADOS, e com a TAG isso vira obrigatório. `p.campo` escreve
  // o valor CRU: nome de obra comprido já corria por cima da coluna do QR, e ninguém tinha notado
  // porque as obras testadas eram curtas. "TPR00870 | Torocua - Ñacunday" não cabe a 8 pt nos ~70 mm
  // da célula. Encaixar diminui a fonte e, no limite, corta — visível e honesto, ao contrário de
  // texto invadindo a célula vizinha.
  p.negrito("CLIENTE:", 3.5, 19, 4.2);
  p.encaixar({ s: cliente || "—", mmX: 4.5, mmY: 23.2, xFim: colDir - 1.5, tamMax: 8 });

  p.negrito("OBRA:", 3.5, 28, 4.2);
  p.encaixar({ s: obraComTag(tagObra, obra), mmX: 4.5, mmY: 32.2, xFim: colDir - 1.5, tamMax: 8 });
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

function desenharEtiqueta(pg, { cliente, obra, tagObra, opNumero, peca, indice, total, qr, font, bold, logo }) {
  const p = pincel(pg, font, bold);
  moldura(p);
  cabecalho(p, { opNumero, marca: peca.marca, qr, logo });
  corpo(p, { cliente, obra, tagObra, peca, indice, total });
}
