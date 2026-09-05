import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { montarCronogramaPrevio, textoDaProposta } from "@/lib/cronograma-previo";

// ─── CRONOGRAMA PRELIMINAR — a folha que vai junto da proposta ────────────────────────────────
//
// Vitor (05/09/2026): "consegue gerar uma prévia do pdf desse cronograma… precisa ser algo
// parecido com o portal do cliente que fizemos".
//
// ⚠⚠ É DOCUMENTO DE CLIENTE, e isso decide o que entra. O estudo sabe o ritmo da casa (kg/dia da
// engenharia, kg/dia da fábrica), a fila de obras e a margem — nada disso é assunto do cliente e
// nada disso aparece aqui. O que aparece é o que ele contrata: quando começa, quando termina, de
// quantos em quantos dias chega uma carreta e quanto vem em cada uma.
//
// ⚠ E PRELIMINAR SE ESCREVE NA FOLHA. O prazo depende da assinatura, da liberação do projeto
// básico e do aço do fornecedor; a folha diz isso em vez de deixar o cliente supor uma data firme.
// (Regra da casa: documento de cliente nunca declara furo nosso — mas premissa de prazo não é
// furo, é o contrato do prazo.)

const PW = 595.28, PH = 841.89;
const M = 40;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const NAVY2 = rgb(0.10, 0.20, 0.36);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0.13, 0.17, 0.23);
const GRAY = rgb(0.42, 0.49, 0.56);
const LINE = rgb(0.85, 0.88, 0.91);
const LIGHT = rgb(0.965, 0.975, 0.985);
const WHITE = rgb(1, 1, 1);

const COR_FASE = {
  engenharia: rgb(0.39, 0.40, 0.95),
  compras: rgb(0.96, 0.62, 0.07),
  producao: rgb(0.05, 0.65, 0.91),
  expedicao: rgb(0.06, 0.72, 0.51),
};

const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").replace(/[   ]/g, " ").split("")
  .map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const numBR = (v, casas = 0) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null);

/**
 * @param {object} dados { cliente, obra, refCliente, numero, pesoKg, cargas, cfg }
 * @returns {Promise<Uint8Array>}
 */
export async function gerarCronogramaPrevioPDF(dados = {}) {
  const cron = dados.cron || montarCronogramaPrevio({ pesoKg: dados.pesoKg, cargas: dados.cargas }, dados.cfg || {});
  const r = cron.resumo;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PW, PH]);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const txt = (s, x, y, { size = 9, f = font, cor = DARK, max = null } = {}) => {
    let str = san(s);
    if (max) { while (str.length > 1 && f.widthOfTextAtSize(str + "...", size) > max) str = str.slice(0, -1); if (f.widthOfTextAtSize(san(s), size) > max) str += "..."; }
    page.drawText(str, { x, y, size, font: f, color: cor });
    return f.widthOfTextAtSize(str, size);
  };
  const txtDir = (s, xFim, y, o = {}) => {
    const f = o.f || font, size = o.size || 9;
    const w = f.widthOfTextAtSize(san(s), size);
    txt(s, xFim - w, y, o);
  };

  // ── CAPA DA FOLHA — a faixa navy com o filete laranja, igual ao portal ──
  page.drawRectangle({ x: 0, y: PH - 118, width: PW, height: 118, color: NAVY });
  page.drawRectangle({ x: 0, y: PH - 122, width: PW, height: 4, color: ORANGE });
  // ⚠ o logo é uma imagem larga e baixa: reservar a faixa dele ANTES de escrever, senão o título
  // passa por cima (foi o que aconteceu na primeira prova).
  if (logo) {
    const w = 78, h = (logo.height / logo.width) * w;
    page.drawImage(logo, { x: M, y: PH - 34 - h, width: w, height: h });
  } else {
    txt("TORG METAL", M, PH - 46, { size: 13, f: bold, cor: WHITE });
  }
  txt("CRONOGRAMA PRELIMINAR DE FORNECIMENTO", M, PH - 86, { size: 13, f: bold, cor: WHITE });
  const sub = [dados.cliente, dados.obra].filter(Boolean).join("  ·  ");
  if (sub) txt(sub, M, PH - 102, { size: 9.5, cor: rgb(0.72, 0.80, 0.90), max: PW - 2 * M - 150 });
  const ref = [dados.numero ? `Estudo ${dados.numero}` : null, dados.refCliente ? `Ref. ${dados.refCliente}` : null,
    `Emitido em ${fmtData(new Date())}`].filter(Boolean);
  ref.forEach((l, i) => txtDir(l, PW - M, PH - 42 - i * 12, { size: 8.5, cor: rgb(0.72, 0.80, 0.90) }));

  // ── OS QUATRO NÚMEROS QUE O CLIENTE PROCURA ──
  let y = PH - 158;
  const tiles = [
    { r: "Prazo total", v: `${numBR(r.totalCorridos)} dias`, n: "corridos, a partir da assinatura" },
    { r: "Fornecimento", v: `${numBR(r.pesoKg)} kg`, n: "estrutura metálica" },
    { r: "Entregas", v: `${numBR(r.cargas)} ${r.cargas === 1 ? "carga" : "cargas"}`, n: `~${numBR(r.pesoPorCarga)} kg por carga` },
    { r: "Intervalo", v: r.intervaloEntregasCorridos > 0 ? `${numBR(r.intervaloEntregasCorridos)} dias` : "entrega única", n: r.intervaloEntregasCorridos > 0 ? "entre uma carga e outra" : "ao final da fabricação" },
  ];
  const tw = (PW - 2 * M - 3 * 10) / 4;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + 10);
    page.drawRectangle({ x, y: y - 54, width: tw, height: 54, color: LIGHT, borderColor: LINE, borderWidth: 0.6 });
    txt(t.r.toUpperCase(), x + 9, y - 16, { size: 7, f: bold, cor: GRAY });
    txt(t.v, x + 9, y - 34, { size: 14, f: bold, cor: NAVY2, max: tw - 18 });
    txt(t.n, x + 9, y - 46, { size: 6.8, cor: GRAY, max: tw - 18 });
  });
  y -= 78;

  // ── A LINHA DO TEMPO ──
  txt("Etapas do fornecimento", M, y, { size: 10.5, f: bold, cor: NAVY2 });
  y -= 6;
  const xLabel = M, wLabel = 132;
  const xBar = M + wLabel + 8, wBar = PW - M - xBar - 84;
  const total = Math.max(1, r.totalUteis);
  const comData = !!r.dataInicio;

  // régua: marcas a cada ~1/6 do prazo, em dias corridos (é como o cliente conta)
  y -= 14;
  page.drawLine({ start: { x: xBar, y }, end: { x: xBar + wBar, y }, thickness: 0.6, color: LINE });
  for (let i = 0; i <= 6; i++) {
    const x = xBar + (wBar * i) / 6;
    page.drawLine({ start: { x, y }, end: { x, y: y + 4 }, thickness: 0.6, color: LINE });
    const diaCorrido = Math.round((total * i / 6) * 7 / 5);
    const rot = comData ? fmtData(new Date(+r.dataInicio + diaCorrido * 86400000)).slice(0, 5) : `d${diaCorrido}`;
    const w = font.widthOfTextAtSize(rot, 6.5);
    txt(rot, x - w / 2, y + 7, { size: 6.5, cor: GRAY });
  }
  y -= 8;

  for (const f of cron.fases) {
    const alt = 22;
    page.drawRectangle({ x: xBar, y: y - alt + 4, width: wBar, height: alt - 8, color: rgb(0.97, 0.975, 0.98) });
    const x0 = xBar + (f.inicio / total) * wBar;
    const larg = Math.max(6, (f.dias / total) * wBar);
    page.drawRectangle({ x: x0, y: y - alt + 4, width: larg, height: alt - 8, color: COR_FASE[f.key] || NAVY2 });
    txt(f.nome, xLabel, y - 12, { size: 9, f: bold, cor: DARK, max: wLabel });
    txt(f.detalhe, xLabel, y - 21, { size: 6.6, cor: GRAY, max: wLabel });
    const dur = comData ? `${fmtData(f.dataInicio).slice(0, 5)} a ${fmtData(f.dataFim).slice(0, 5)}` : `${Math.round(f.dias * 7 / 5)} dias`;
    txtDir(dur, PW - M, y - 14, { size: 7.5, cor: GRAY });
    y -= alt + 8;
  }

  // ── AS CARGAS ──
  y -= 22;
  txt("Entregas na obra", M, y, { size: 10.5, f: bold, cor: NAVY2 });
  txtDir(r.cargas > 1 ? `uma carga a cada ${numBR(r.intervaloEntregasCorridos)} dias` : "entrega única", PW - M, y, { size: 8, cor: GRAY });
  y -= 8;

  // régua das cargas: cada carreta como um marcador na linha do tempo — é a "representação
  // das cargas" que o cliente usa para planejar a montagem dele
  const yReg = y - 22;
  page.drawRectangle({ x: xBar, y: yReg, width: wBar, height: 14, color: LIGHT, borderColor: LINE, borderWidth: 0.5 });
  txt("linha do tempo", xLabel, yReg + 4, { size: 7, cor: GRAY });
  for (const e of cron.entregas) {
    const x = xBar + Math.min(1, e.diaUtil / total) * wBar;
    page.drawRectangle({ x: Math.min(x, xBar + wBar - 3), y: yReg, width: 3, height: 14, color: COR_FASE.expedicao });
  }
  y = yReg - 16;

  const cabecalhos = [["Carga", 52], ["Dia corrido", 62], ["Data", 68], ["Peso", 62]];
  const colX = [];
  let cx = M;
  for (const [, w] of cabecalhos) { colX.push(cx); cx += w; }
  // ⚠ A TABELA CEDE ESPAÇO PARA AS PREMISSAS, não o contrário. Na prova de 541 t (46 cargas) a
  // lista empurrou o bloco de premissas para fora da folha — e é ele que diz que o prazo é
  // preliminar. Cabem as cargas que couberem; o resto vira uma linha de resumo.
  const RESERVA_PREMISSAS = 190;
  const maxLinhas = Math.max(3, Math.floor((y - RESERVA_PREMISSAS) / 14));
  const linhas = cron.entregas.slice(0, maxLinhas);
  page.drawRectangle({ x: M, y: y - 14, width: PW - 2 * M, height: 14, color: LIGHT });
  cabecalhos.forEach(([rot, w], i) => txt(rot.toUpperCase(), colX[i] + 4, y - 10, { size: 6.8, f: bold, cor: GRAY, max: w - 8 }));
  y -= 14;
  for (const e of linhas) {
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.4, color: LINE });
    const diaCorrido = Math.round((e.diaUtil * 7) / 5);
    txt(`${e.n}ª`, colX[0] + 4, y - 10, { size: 8 });
    txt(String(diaCorrido), colX[1] + 4, y - 10, { size: 8, cor: GRAY });
    txt(comData ? fmtData(e.data) : "-", colX[2] + 4, y - 10, { size: 8 });
    txt(`${numBR(e.kg)} kg`, colX[3] + 4, y - 10, { size: 8 });
    y -= 14;
  }
  if (cron.entregas.length > linhas.length) {
    txt(`E mais ${cron.entregas.length - linhas.length} cargas, no mesmo intervalo.`, M + 4, y - 10, { size: 7.5, cor: GRAY });
    y -= 14;
  }

  // ── PREMISSAS ──
  y -= 14;
  const texto = textoDaProposta(cron, {});
  const premissas = [
    texto,
    "O prazo conta a partir da assinatura do contrato e da liberação do projeto básico pelo cliente.",
    "Fabricação medida em dias úteis; o prazo total está convertido em dias corridos.",
    "As datas são confirmadas na assinatura, conforme a fila de fabricação e o prazo de entrega do aço na data.",
  ];
  // ⚠ quebra ANTES de desenhar: a caixa tem de ter a altura do texto que ela guarda, não um palpite
  // de 22px por item — com palpite sobra tarja cinza embaixo do último parágrafo.
  const larguraTexto = PW - 2 * M - 20;
  const linhasTexto = [];
  for (const p of premissas) {
    let linha = "";
    for (const w of san(p).split(" ")) {
      const teste = linha ? `${linha} ${w}` : w;
      if (font.widthOfTextAtSize(teste, 7.6) > larguraTexto) { linhasTexto.push(linha); linha = w; }
      else linha = teste;
    }
    if (linha) linhasTexto.push(linha);
    linhasTexto.push(null); // respiro entre parágrafos
  }
  const alturaBloco = 22 + linhasTexto.reduce((a, l) => a + (l === null ? 4 : 10), 0);
  page.drawRectangle({ x: M, y: y - alturaBloco, width: PW - 2 * M, height: alturaBloco, color: LIGHT, borderColor: LINE, borderWidth: 0.6 });
  txt("Premissas", M + 10, y - 14, { size: 8, f: bold, cor: NAVY2 });
  let yp = y - 26;
  for (const l of linhasTexto) {
    if (l === null) { yp -= 4; continue; }
    txt(l, M + 10, yp, { size: 7.6, cor: GRAY });
    yp -= 10;
  }

  // ── RODAPÉ ──
  page.drawRectangle({ x: 0, y: 0, width: PW, height: 26, color: NAVY });
  txt("Torg Metal — Estruturas Metálicas", M, 10, { size: 7.5, cor: rgb(0.72, 0.80, 0.90) });
  txtDir("Documento preliminar — não substitui o cronograma contratual", PW - M, 10, { size: 7.5, cor: rgb(0.72, 0.80, 0.90) });

  return await pdf.save();
}
