// Desenhos esquemáticos dos MODELOS DE EMBALAGEM do simulador (pdf-lib, vetor puro) — a referência
// de "como se monta" cada tipo de volume, com as regras do lib/carga/premissas.js escritas ao lado.
// Vitor (14/09/2026): "o ideal seria um desenho do modelo das embalagens para usarmos como referência
// para montagem". Cada modelo é um painel: título, vista de frente + vista de topo/lateral, e as regras.
// Não é o volume real (esse é a foto 3D do cartão de cada volume): é o PADRÃO, igual para toda obra.
import { degrees, rgb } from "pdf-lib";
import { CAIXA_MAD, EMB, MEDIDAS, PAC, PAC_GC, PAC_GRADE } from "./premissas";

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const MAD = hex("#c49a6c"), MAD_ESC = hex("#8a6a45"), ACO = hex("#9aa7b4"), ACO_ESC = hex("#5b6b7a"), CINTA = hex("#1f2937"), COTA = hex("#0b4a75"), TRACO = hex("#374151"), FUNDO = hex("#f8fafc");
const cm = (mm) => `${Math.round(mm / 10)} cm`;
const kg = (v) => `${Math.round(v).toLocaleString("pt-BR")} kg`;

/** Regras de montagem por tipo — o texto que vai ao lado do desenho. Números vêm das premissas. */
export const REGRAS = {
  caixa: [
    `Fundo fechado sobre 3 caibros 5×6 (paletizada), laterais e tampa ripadas em tábua 2,5×30; montantes de sarrafo nos 4 cantos.`,
    `Comprimento até ${cm(CAIXA_MAD.compMax)}, altura até ${cm(CAIXA_MAD.alturaMax)}, ${kg(CAIXA_MAD.kgTotal)} no máximo. Peça de até ${kg(CAIXA_MAD.kgMax)} cada.`,
    `Miúdos da mesma marca juntos (sacos ou amarrados); a lista de marcas e quantidades vai pregada na tampa.`,
  ],
  gc: [
    `Painéis DEITADOS, um sobre o outro, casados pelo mesmo tamanho; sarrafo 2,5×5 entre cada camada, alinhado.`,
    `2 cintas PET a 50 cm das pontas e mais 1 a cada 1,5 m; altura do pacote até ${cm(PAC_GC.alturaMax)}, ${kg(PAC_GC.kgMax)} no máximo.`,
    `Nada em cima do pacote; em pé só dentro de engradado ou sobre cavalete — nunca inclinado.`,
  ],
  grade: [
    `Grades empilhadas casadas (mesma medida embaixo e em cima), sarrafo 2,5×5 entre camadas nas duas pontas e no meio.`,
    `Cintas PET a 50 cm das pontas; altura até ${cm(PAC_GRADE.alturaMax)}, ${kg(PAC_GRADE.kgMax)} no máximo. Degraus vão junto das grades.`,
    `Delicado: vai por cima da carga e nada sobe nele. Carga só de grade sai em camadas, maior embaixo.`,
  ],
  degrau: null, // usa o da grade
  feixe: [
    `Barras/perfis alinhados pelas pontas, fileiras separadas por sarrafo (calço) a cada 1,5 m; seção do feixe até ${cm(PAC.secaoMax)} × ${cm(PAC.alturaMax)}.`,
    `Cintas PET a 50 cm das pontas e a cada 1,5 m, com cantoneira de proteção; até ${kg(PAC.kgMax)} por feixe.`,
    `Perfil viaja com a alma em pé; peça mais pesada embaixo do feixe.`,
  ],
  engradado: [
    `Quadro de caibro ${cm(EMB.engradado.quadro)} com base de ${cm(EMB.engradado.base)}, diagonal de travamento nas duas faces, tampa de ${cm(EMB.engradado.tampa)}.`,
    `Painéis em pé, separados por sarrafo; largura do engradado até ${cm(EMB.engradado.largMax)}, ${kg(EMB.engradado.kgMax)} no máximo.`,
    `Cintas por fora do quadro; empilha só engradado sobre engradado do mesmo tamanho.`,
  ],
  solta: [
    `Sobre 2 caibros 5×6 no mínimo (1 a cada 1,5 m), atravessados e alinhados com os da camada de baixo.`,
    `Calço de ${cm(MEDIDAS.CALCO)} quando a base não é plana; cinta catraca sobre a peça em cada apoio.`,
    `Perfil com a alma em pé, chapa deitada; comprida e pesada embaixo, junto do eixo.`,
  ],
};

// ── primitivas ──
const rect = (page, x, y, w, h, cor, borda, esp = 0.6) => page.drawRectangle({ x, y, width: w, height: h, color: cor, borderColor: borda, borderWidth: borda ? esp : 0 });
const linha = (page, x1, y1, x2, y2, cor = TRACO, esp = 0.6, tracejada = false) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: esp, color: cor, ...(tracejada ? { dashArray: [2, 2] } : {}) });
const cinta = (page, x, y, h) => { linha(page, x, y, x, y + h, CINTA, 1.6); };
const cota = (page, font, x1, x2, y, rotulo) => { linha(page, x1, y, x2, y, COTA, 0.5); linha(page, x1, y - 3, x1, y + 3, COTA, 0.5); linha(page, x2, y - 3, x2, y + 3, COTA, 0.5); const w = font.widthOfTextAtSize(rotulo, 6); page.drawText(rotulo, { x: (x1 + x2) / 2 - w / 2, y: y + 2, size: 6, font, color: COTA }); };
// cota vertical à ESQUERDA do desenho, com o texto em pé — à direita ela invadia a vista de ponta
const cotaV = (page, font, x, y1, y2, rotulo) => { linha(page, x, y1, x, y2, COTA, 0.5); linha(page, x - 3, y1, x + 3, y1, COTA, 0.5); linha(page, x - 3, y2, x + 3, y2, COTA, 0.5); const w = font.widthOfTextAtSize(rotulo, 6); page.drawText(rotulo, { x: x - 2, y: (y1 + y2) / 2 - w / 2, size: 6, font, color: COTA, rotate: degrees(90) }); };
const legenda = (page, font, x, y, t) => page.drawText(t, { x, y, size: 6, font, color: hex("#6b7280") });
const caibros = (page, x, y, w, n, s = 7) => { for (let i = 0; i < n; i++) { const cx = n === 1 ? x + w / 2 - s / 2 : x + (w - s) * (i / (n - 1)); rect(page, cx, y, s, s, MAD_ESC); } };
const barraBase = (page, x, y, w) => rect(page, x, y, w, 7, MAD_ESC); // caibro visto de ponta: corre ao longo da largura

// ── vistas de frente (largura A × altura H, base em y) ──
function frenteCaixa(page, font, x, y, w, h) {
  caibros(page, x, y, w, 3); const y0 = y + 7;
  rect(page, x, y0, w, h * 0.12, MAD); // fundo fechado
  for (let i = 0; i < 4; i++) rect(page, x, y0 + h * 0.15 + i * h * 0.17, w, h * 0.11, MAD, MAD_ESC, 0.4); // laterais ripadas
  rect(page, x, y0 + h * 0.85, w, h * 0.13, MAD, MAD_ESC, 0.4); // tampa
  for (const px of [x + 2, x + w - 6]) rect(page, px, y0, 4, h * 0.98, MAD_ESC); // montantes
  cota(page, font, x, x + w, y - 8, "C até 200 cm"); cotaV(page, font, x - 8, y0, y0 + h * 0.98, "A até 60 cm");
}
function frentePacote(page, font, x, y, w, h, grade) {
  caibros(page, x, y, w, 3); const y0 = y + 7, n = 4, ph = (h - 7) / n;
  for (let i = 0; i < n; i++) { const py = y0 + i * ph;
    rect(page, x, py + ph * 0.35, w, ph * 0.5, grade ? ACO : ACO_ESC, TRACO, 0.4); // painel
    if (grade) for (let g = x + 6; g < x + w - 4; g += 10) linha(page, g, py + ph * 0.35, g, py + ph * 0.85, hex("#e5e7eb"), 0.5); // barras da grade
    for (const sx of [x + w * 0.08, x + w * 0.5, x + w * 0.92]) rect(page, sx - 3, py + ph * 0.05, 6, ph * 0.3, MAD); } // sarrafos entre camadas
  for (const sx of [x + w * 0.12, x + w * 0.5, x + w * 0.88]) cinta(page, sx, y0 - 2, h - 4);
  cota(page, font, x, x + w, y - 8, "C"); cotaV(page, font, x - 8, y0, y0 + h - 7, "A até 50 cm");
}
function frenteFeixe(page, font, x, y, w, h) {
  caibros(page, x, y, w, 3); const y0 = y + 7, filas = 3, fh = (h - 7) / filas;
  for (let i = 0; i < filas; i++) { const py = y0 + i * fh; rect(page, x, py + fh * 0.3, w, fh * 0.55, ACO_ESC, TRACO, 0.4);
    for (const sx of [x + w * 0.1, x + w * 0.5, x + w * 0.9]) rect(page, sx - 3, py, 6, fh * 0.3, MAD); }
  for (const sx of [x + w * 0.1, x + w * 0.5, x + w * 0.9]) cinta(page, sx, y0 - 2, h - 4);
  cota(page, font, x, x + w, y - 8, "C"); cotaV(page, font, x - 8, y0, y0 + h - 7, "até 60 cm");
}
function frenteEngradado(page, font, x, y, w, h) {
  caibros(page, x, y, w, 2); const y0 = y + 7, q = 5;
  rect(page, x, y0, w, q * 1.4, MAD_ESC); rect(page, x, y0 + h - q - 7, w, q, MAD); // base e tampa
  for (const px of [x, x + w - q]) rect(page, px, y0, q, h - 7, MAD);
  const ang = Math.atan2(h - 7 - q * 2, w - q * 2); const len = Math.hypot(h - 7 - q * 2, w - q * 2);
  page.drawRectangle({ x: x + q, y: y0 + q * 1.4, width: len, height: q * 0.8, color: MAD, rotate: { type: "degrees", angle: ang * 180 / Math.PI } }); // diagonal
  for (let px = x + q + 8; px < x + w - q - 4; px += 9) linha(page, px, y0 + q * 1.6, px, y0 + h - q - 9, ACO_ESC, 1.2); // painéis em pé
  cota(page, font, x, x + w, y - 8, "C"); cotaV(page, font, x - 8, y0, y0 + h - 7, "A");
}
function frenteSolta(page, font, x, y, w, h) {
  caibros(page, x, y, w, 3); const y0 = y + 7, ph = h - 7;
  rect(page, x, y0, w, ph * 0.12, ACO_ESC); rect(page, x + w * 0.02, y0 + ph * 0.12, w * 0.96, ph * 0.66, ACO, TRACO, 0.3); rect(page, x, y0 + ph * 0.78, w, ph * 0.12, ACO_ESC); // viga (alma em pé)
  for (const sx of [x + w * 0.2, x + w * 0.8]) { linha(page, sx, y0 - 3, sx, y0 + ph * 0.9 + 3, CINTA, 1.2, true); } // cinta catraca
  cota(page, font, x, x + w, y - 8, "C");
}

// ── vistas de ponta (seção) ──
function pontaCaixa(page, font, x, y, w, h) { barraBase(page, x, y, w); const y0 = y + 7; rect(page, x, y0, w, h - 7, MAD, MAD_ESC, 0.5); rect(page, x + 3, y0 + 3, w - 6, h - 16, FUNDO, MAD_ESC, 0.3); for (let i = 0; i < 6; i++) rect(page, x + 6 + (i % 3) * 8, y0 + 6 + Math.floor(i / 3) * 8, 5, 5, ACO_ESC); cota(page, font, x, x + w, y - 8, "L até 80 cm"); }
function pontaPacote(page, font, x, y, w, h) { rect(page, x, y, w, 7, MAD_ESC); const y0 = y + 7, n = 4, ph = (h - 7) / n; for (let i = 0; i < n; i++) { const py = y0 + i * ph; rect(page, x, py + ph * 0.35, w, ph * 0.5, ACO, TRACO, 0.4); rect(page, x + w * 0.1, py + ph * 0.05, w * 0.8, ph * 0.3, MAD); } rect(page, x - 2, y0 - 2, w + 4, h - 4, undefined, CINTA, 1.2); cota(page, font, x, x + w, y - 8, "L até 120 cm"); }
function pontaFeixe(page, font, x, y, w, h) { rect(page, x, y, w, 7, MAD_ESC); const y0 = y + 7; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { rect(page, x + 3 + j * (w - 6) / 3, y0 + 3 + i * (h - 12) / 3, (w - 6) / 3 - 2, (h - 12) / 3 - 4, ACO_ESC); } rect(page, x - 2, y0 - 2, w + 4, h - 4, undefined, CINTA, 1.2); cota(page, font, x, x + w, y - 8, "até 50 cm"); }
function pontaEngradado(page, font, x, y, w, h) { barraBase(page, x, y, w); const y0 = y + 7, q = 5; rect(page, x, y0, w, h - 7, undefined, MAD, 1.5); for (let px = x + q + 3; px < x + w - q - 2; px += 6) linha(page, px, y0 + q, px, y0 + h - q - 8, ACO_ESC, 1.4); cota(page, font, x, x + w, y - 8, "até 62 cm"); }
function pontaSolta(page, font, x, y, w, h) { barraBase(page, x, y, w); const y0 = y + 7, cx = x + w / 2, ph = h - 7; rect(page, x + w * 0.2, y0, w * 0.6, ph * 0.12, ACO_ESC); rect(page, cx - 2, y0 + ph * 0.12, 4, ph * 0.66, ACO_ESC); rect(page, x + w * 0.2, y0 + ph * 0.78, w * 0.6, ph * 0.12, ACO_ESC); for (const s of [-1, 1]) page.drawRectangle({ x: cx + s * w * 0.32 - 4, y: y0, width: 8, height: ph * 0.14, color: MAD }); legenda(page, font, x - 4, y - 8, "calço 15 cm"); }

const FRENTE = { caixa: frenteCaixa, gc: (p, f, x, y, w, h) => frentePacote(p, f, x, y, w, h, false), grade: (p, f, x, y, w, h) => frentePacote(p, f, x, y, w, h, true), degrau: (p, f, x, y, w, h) => frentePacote(p, f, x, y, w, h, true), feixe: frenteFeixe, engradado: frenteEngradado, solta: frenteSolta };
const PONTA = { caixa: pontaCaixa, gc: pontaPacote, grade: pontaPacote, degrau: pontaPacote, feixe: pontaFeixe, engradado: pontaEngradado, solta: pontaSolta };

/**
 * Desenha o painel do modelo de um tipo: cabeçalho colorido, vista de frente + vista de ponta e as regras.
 * @param {import("pdf-lib").PDFPage} page
 * @param {string} tipo  caixa | gc | grade | degrau | feixe | engradado | solta
 * @param {{x:number,y:number,w:number,h:number}} caixa  área do painel (y = base)
 * @param {{font:object,bold:object,titulo:string,cor:object}} opts
 */
export function desenharModeloEmbalagem(page, tipo, { x, y, w, h }, { font, bold, titulo, cor }) {
  rect(page, x, y, w, h, undefined, hex("#d0d7de"), 0.6); rect(page, x, y + h - 16, w, 16, cor);
  page.drawText(titulo, { x: x + 7, y: y + h - 11.5, size: 9, font: bold, color: rgb(1, 1, 1) });
  const regras = (REGRAS[tipo] || REGRAS.grade).map((r) => quebra(r, font, 6.5, w - 16)), nLin = regras.reduce((n, r) => n + r.length, 0), hReg = nLin * 8 + regras.length * 2 + 8;
  const areaY = y + hReg + 18, areaH = y + h - 32 - areaY; // cotas ficam abaixo (−8) e a legenda das vistas acima
  const wF = (w - 30) * 0.62, wP = (w - 30) * 0.26;
  (FRENTE[tipo] || frenteSolta)(page, font, x + 20, areaY, wF - 10, areaH);
  (PONTA[tipo] || pontaSolta)(page, font, x + 10 + wF + 26, areaY, wP, areaH);
  legenda(page, font, x + 10, y + h - 26, "vista de frente"); legenda(page, font, x + 10 + wF + 26, y + h - 26, "vista de ponta");
  let ty = y + hReg - 6; for (const r of regras) { for (const [i, ln] of r.entries()) { page.drawText((i === 0 ? "• " : "   ") + ln, { x: x + 8, y: ty, size: 6.5, font, color: hex("#1f2937") }); ty -= 8; } ty -= 2; }
}

function quebra(str, f, size, maxW) { const out = []; let l = ""; for (const w of String(str).split(" ")) { const t = l ? `${l} ${w}` : w; if (f.widthOfTextAtSize(t, size) <= maxW) l = t; else { out.push(l); l = w; } } if (l) out.push(l); return out; }
