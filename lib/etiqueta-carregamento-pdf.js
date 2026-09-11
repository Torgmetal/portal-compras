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
 * @property {number} [qte]        quantas peças — vira uma etiqueta por peça, numeradas 1/N
 * @property {boolean} [emCaixa]   o lote vai numa caixa só: UMA etiqueta, dizendo "N/N"
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
    //
    // ⚠⚠ EXCETO QUANDO A MARCA VAI NUMA CAIXA. Matheus (11/09/2026): "pode ocorrer casos de uma
    // marca ter 50 peças mas são todas pequenas, aí montamos uma caixa com as 50 peças e colamos
    // somente 1 etiqueta 50/50; se não tiver essa opção o portal vai imprimir as 50 etiquetas".
    // Sai UMA etiqueta, e ela diz "50/50" — o volume é um só e carrega o lote inteiro.
    const quantas = peca.emCaixa ? 1 : total;
    const qrs = await Promise.all(
      Array.from({ length: quantas }, () =>
        QRCode.toBuffer(String(peca.marca ?? ""), { type: "png", margin: 0, width: 320, errorCorrectionLevel: "M" })
      )
    );
    for (let i = 0; i < quantas; i++) {
      const pg = pdf.addPage([L, A]);
      desenhar(pg, {
        cliente, obra, tagObra, opNumero, peca,
        // Na caixa o índice é o próprio total: a etiqueta única representa o lote todo.
        indice: peca.emCaixa ? total : i + 1, total,
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
 * ⚠ A TAG VEM DEPOIS DO NOME DA OBRA. Matheus (11/09/2026): "ajusta nossa etiqueta padrão para a
 * TAG sair depois do nome da obra". Quem lê a etiqueta no pátio procura a OBRA; a TAG é referência
 * do cliente, e à frente ela empurrava o nome da obra para longe da borda onde o olho começa.
 *
 * ⚠ SEPARADOR " | ", NÃO HÍFEN. Mesma lição que a TAG/DESCRIÇÃO do modelo QWS custou (10/09/2026:
 * "ficou T102A1-SE-001, parece um negócio só"): hífen entre dois códigos de origens diferentes funde
 * os dois num terceiro que não existe em lugar nenhum.
 */
const obraComTag = (tagObra, obra) =>
  [obra, tagObra].map((s) => String(s ?? "").trim()).filter(Boolean).join(" | ") || "—";

/**
 * RÓTULO E VALOR NA MESMA LINHA, e os valores alinhados numa coluna só.
 *
 * ⚠⚠ O MOTIVO É A BORDA, NÃO A ESTÉTICA. Matheus (11/09/2026): "dessa forma já vamos tirar um pouco
 * do canto esquerdo as escritas, assim mesmo que corte não vai cortar informações". Com o valor
 * embaixo do rótulo ele começava a 4,5 mm da borda; ao lado, começa depois do rótulo — e o que a
 * impressora eventualmente corta é o rótulo, que se adivinha, não o dado, que não se adivinha.
 *
 * ⚠ Os dois valores começam no MESMO x, calculado do rótulo mais largo. Cada um começando onde o
 * seu rótulo acaba deixaria CLIENTE e OBRA desalinhados por 3 mm, que numa etiqueta desse tamanho
 * se vê.
 */
function linhaDeCampo(p, { rotulo, valor, xRot, xVal, mmY, xFim, tam = 8 }) {
  p.negrito(rotulo, xRot, mmY, 4.2);
  p.encaixar({ s: valor, mmX: xVal, mmY, xFim, tamMax: tam });
}

/**
 * RÓTULO E VALOR CENTRADOS NA CÉLULA — QTDE e PESO.
 *
 * ⚠ Matheus (11/09/2026): "ajustar campos QTDE e PESO para ficar no centro, cabeçalho e informação".
 * Mesma decisão já tomada no modelo QWS, e pelo mesmo motivo aqui: "1/12" e "9,76" são curtos, e
 * encostados à esquerda deixavam quase toda a célula vazia — bem na borda que a impressora corta.
 */
function celulaCentrada(p, { rotulo, valor, entre, yRot, yVal, tam }) {
  p.centro({ s: rotulo, entre, mmY: yRot, tam: 4.2, f: p.bold });
  const r = ajustarTexto(valor, p.bold, { xIni: entre[0] + 1, xFim: entre[1] - 1, tamMax: tam });
  p.centro({ s: r.texto, entre, mmY: yVal, tam: r.tam, f: p.bold });
}

function corpo(p, { cliente, obra, tagObra, peca, indice, total }) {
  const { borda: B, colDir, colQtde, fimDir } = GRADE;

  const xRot = 3.5;
  const xVal = xRot + Math.max(p.larg("CLIENTE:", 4.2, p.bold), p.larg("OBRA:", 4.2, p.bold)) + 2;
  // ⚠ CLIENTE e OBRA são encaixados: o valor cru já corria por cima da coluna do QR quando o nome
  // era comprido, e agora divide a linha com o rótulo, que é menos espaço ainda.
  linhaDeCampo(p, { rotulo: "CLIENTE:", valor: cliente || "—", xRot, xVal, mmY: 20.8, xFim: colDir - 1.5 });
  linhaDeCampo(p, { rotulo: "OBRA:", valor: obraComTag(tagObra, obra), xRot, xVal, mmY: 29.8, xFim: colDir - 1.5 });

  celulaCentrada(p, { rotulo: "QTDE. (PÇ):", valor: contagemDaEtiqueta(indice, total),
                      entre: [B, colQtde], yRot: 36.6, yVal: 40.7, tam: 7.5 });
  celulaCentrada(p, { rotulo: "PESO (kg):", valor: pesoBR(peca.pesoUnitKg),
                      entre: [B, colQtde], yRot: 45, yVal: 48.2, tam: 7.5 });

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
