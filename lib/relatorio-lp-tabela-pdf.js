import "server-only";
import { M, san, quebrarTexto, DARK, GRAY, LINE, SOFT, RED, GREEN, ORANGE } from "./relatorio-form-pdf";
import { LAUDOS } from "./evs-campos";

// ─── OS REGISTROS DOS RESULTADOS DO LP (FORM. SGQ - 012) ─────────────────────────────────────────
// A tabela do relatório de líquido penetrante e a legenda que vai com ela — o resto da folha mora em
// lib/relatorio-lp-pdf.js.
//
// ⚠⚠ A TABELA SE PARTE PELO ESPAÇO QUE SOBRA EM CADA FOLHA, não por um número fixo de linhas
// (verificação dos modelos, 02/10/2026). Ela tinha altura FIXA de 20 linhas e ninguém conferia o espaço
// antes do rodapé: com os instrumentos do modelo, a junta soldada em três linhas e a assinatura
// desenhada, nomes e datas saíam abaixo do papel; com mais de 20 linhas a folha 1 saía sem assinatura.

const COLS = [
  { t: "JUNTA / PEÇA", en: "Joint / Part", k: "marca", w: 0.22 },
  { t: "Nº DA INDICAÇÃO", en: "Indication No.", k: "indicacaoLp", w: 0.15, meio: true },
  { t: "LOCAL", en: "Place", k: "local", w: 0.15, meio: true },
  { t: "TAMANHO", en: "Size", k: "tamanho", w: 0.13, meio: true },
  { t: "TIPO DE DEFEITO", en: "Defect Type", k: "tipoDefeito", w: 0.20, meio: true },
  { t: "LAUDO", en: "Certificate", k: "laudo", w: 0.15, meio: true },
];

// ⚠ TETO DE LINHAS POR FOLHA CONTANDO AS VAZIAS. As vazias são o formulário para escrever à mão (o ar de
// planilha que o Vitor pediu), e só entram no último trecho, no espaço que o rodapé deixa livre — nunca
// empurrando instrumentos, observações e assinaturas para fora da folha.
const LINHAS_POR_FOLHA = 20;
const H_TIT = 14, H_CAB_TAB = 21, H_LIN = 13;
const TAM = 7, ENTRE = 8.5;
const TAM_OBS = 6.4, ENTRE_OBS = 8;

const LEGENDA = [
  "A - APROVADO (Approved)      R - REPROVADO (Rejected)      REC - RECOMENDAÇÃO DE EXAME COMPLEMENTAR (Recommended Additional Test)",
  "IL - INDICAÇÃO LINEAR (Linear Indication)      IA - INDICAÇÃO ARREDONDADA (Rounded Indication)      INR - INDICAÇÃO NÃO RELEVANTE (Non-relevant)",
];
const ALTURA_LEGENDA = 12 + LEGENDA.length * 8.5 + 4;

const COR = { verde: GREEN, vermelho: RED, laranja: ORANGE };
/**
 * A cor do laudo é a da lista de laudos (lib/evs-campos): A verde, R vermelho, REC laranja.
 * ⚠ "Começa com R" pintava o REC de vermelho, como reprovado (02/10/2026) — e recomendar exame
 * complementar não é reprovar.
 */
export function corDoLaudo(v) {
  const s = String(v ?? "").trim().toUpperCase();
  const l = s && LAUDOS.find((x) => x.c === s || x.nome.toUpperCase() === s);
  return (l && COR[l.cor]) || null;
}

/** Rótulo da coluna em duas linhas: português em cima, inglês embaixo — como no modelo. */
function tituloColuna(f, c, x, topo) {
  const { page, bold, font } = f;
  const larg = f.W * c.w;
  const t = f.fit(c.t, bold, 5.8, larg - 3);
  page.drawText(t, { x: x + (larg - bold.widthOfTextAtSize(t, 5.8)) / 2, y: topo - 8, size: 5.8, font: bold, color: GRAY });
  const e = f.fit(`(${c.en})`, font, 4.8, larg - 3);
  page.drawText(e, { x: x + (larg - font.widthOfTextAtSize(e, 4.8)) / 2, y: topo - 15, size: 4.8, font, color: GRAY });
}

/**
 * Uma célula: encolhe um pouco para caber numa linha; não cabendo, QUEBRA — encolhendo só o que a
 * palavra mais larga pedir. ⚠ Cortava com "..." (02/10/2026): o local aceita 60 caracteres e a coluna
 * mostrava uns 20.
 */
function celula(texto, fnt, larg) {
  const s = san(texto).trim();
  if (!s) return { tam: TAM, linhas: [] };
  let tam = TAM;
  while (tam > 6 && fnt.widthOfTextAtSize(s, tam) > larg) tam = +(tam - 0.2).toFixed(2);
  if (fnt.widthOfTextAtSize(s, tam) <= larg) return { tam, linhas: [s] };
  const maior = Math.max(...s.split(/\s+/).map((p) => fnt.widthOfTextAtSize(p, 1)));
  tam = TAM;
  while (tam > 5.6 && maior * tam > larg) tam = +(tam - 0.2).toFixed(2);
  return { tam, linhas: quebrarTexto(texto, fnt, tam, larg) };
}

const larguraRotuloObs = (f) => f.bold.widthOfTextAtSize("Obs.:", TAM_OBS) + 4;

/**
 * A altura de uma linha da tabela e o que vai nela. A observação da linha (`obs`) sai embaixo das
 * células, na largura inteira. ⚠ Era pedida no celular e gravada, e nunca impressa (02/10/2026).
 */
function medirLinha(f, l) {
  const celulas = COLS.map((c) => {
    const v = String(l[c.k] ?? "");
    const laudo = c.k === "laudo";
    const fnt = laudo ? f.bold : f.font;
    return { ...celula(v, fnt, f.W * c.w - 8), fnt, cor: (laudo && corDoLaudo(v)) || DARK };
  });
  const hCel = H_LIN + (Math.max(1, ...celulas.map((c) => c.linhas.length)) - 1) * ENTRE;
  const obs = String(l.obs ?? "").trim() ? quebrarTexto(l.obs, f.font, TAM_OBS, f.W - 8 - larguraRotuloObs(f) - 4) : [];
  const hObs = obs.length ? obs.length * ENTRE_OBS + 4 : 0;
  return { celulas, obs, hCel, h: hCel + hObs };
}

/**
 * A tabela, partida entre folhas pelo espaço que sobra em cada uma. Cada trecho leva a faixa, o
 * cabeçalho das colunas e a legenda, para a folha solta ser lida sozinha.
 * @param {object} fl o fluxo (lib/relatorio-fluxo-pdf)
 * @param {number} rodape altura do que vem logo depois (instrumentos, observações): as vazias só
 *   ocupam o que ele deixar livre
 */
export function tabelaLP(fl, linhas, rodape) {
  const medidas = linhas.map((l) => medirLinha(fl.f, l));
  const fixo = H_TIT + H_CAB_TAB + ALTURA_LEGENDA;
  let i = 0, trecho = 0, recemAberta = false;
  // ⚠ laço com saída explícita: tabela sem nenhuma linha também é desenhada (é o formulário em branco)
  for (;;) {
    // cabe o esqueleto do trecho e a primeira linha? senão, a tabela continua na folha seguinte
    if (!fl.cabe(fixo + (medidas[i]?.h ?? H_LIN)) && !recemAberta) { fl.novaFolha(); recemAberta = true; continue; }
    const { n, soma } = quantasCabem(fl, medidas, i, fixo);
    const vazias = i + n >= medidas.length ? quantasVazias(fl, { n, livre: fl.sobra() - fixo - soma - rodape, semLinhas: !medidas.length, fixo }) : 0;
    desenharTrecho(fl.f, medidas.slice(i, i + n), vazias, trecho > 0);
    i += n; trecho++; recemAberta = false;
    if (i >= medidas.length) break;
  }
}

/** Quantas linhas, a partir da `i`, cabem nesta folha com o esqueleto do trecho (e quanto ocupam). */
function quantasCabem(fl, medidas, i, fixo) {
  let n = 0, soma = 0;
  while (i + n < medidas.length && fl.cabe(fixo + soma + medidas[i + n].h)) { soma += medidas[i + n].h; n++; }
  // folha nova e a linha ainda não cabe: só com dado acima dos tetos das rotas — desenha assim mesmo
  if (!n && i < medidas.length) return { n: 1, soma: medidas[i].h };
  return { n, soma };
}

/** As linhas vazias do último trecho: o que o rodapé deixa, até completar a folha de 20. */
function quantasVazias(fl, { n, livre, semLinhas, fixo }) {
  const vazias = Math.max(0, Math.min(LINHAS_POR_FOLHA - n, Math.floor(livre / H_LIN)));
  // ⚠ sem nenhuma linha lançada a folha ainda é o formulário: ao menos as 4 linhas do modelo
  return semLinhas ? Math.max(vazias, Math.min(4, Math.floor((fl.sobra() - fixo) / H_LIN))) : vazias;
}

/** Divisórias das colunas só na altura das células: a observação da linha corre por baixo, inteira. */
function divisorias(f, yTopo, h) {
  let x = M;
  COLS.forEach((c, i) => {
    if (i > 0) f.page.drawLine({ start: { x, y: yTopo }, end: { x, y: yTopo - h }, thickness: 0.7, color: LINE });
    x += f.W * c.w;
  });
}

function desenharTrecho(f, medidas, vazias, continuacao) {
  const { page, bold, W } = f;
  const topoTit = f.bloco(H_TIT, SOFT);
  const tTit = san(`REGISTROS DOS RESULTADOS (Registers of the Results)${continuacao ? " — continuação" : ""}`);
  page.drawText(tTit, { x: M + (W - bold.widthOfTextAtSize(tTit, 7)) / 2, y: topoTit - 10, size: 7, font: bold, color: GRAY });

  const topo = f.bloco(H_CAB_TAB + medidas.reduce((a, m) => a + m.h, 0) + vazias * H_LIN);
  divisorias(f, topo, H_CAB_TAB);
  let x = M;
  for (const c of COLS) { tituloColuna(f, c, x, topo); x += W * c.w; }
  page.drawLine({ start: { x: M, y: topo - H_CAB_TAB }, end: { x: M + W, y: topo - H_CAB_TAB }, thickness: 0.7, color: LINE });

  let ly = topo - H_CAB_TAB;
  medidas.forEach((m, r) => {
    if (r > 0) page.drawLine({ start: { x: M, y: ly }, end: { x: M + W, y: ly }, thickness: 0.35, color: LINE });
    desenharLinha(f, m, ly);
    ly -= m.h;
  });
  for (let v = 0; v < vazias; v++) {
    if (medidas.length || v > 0) page.drawLine({ start: { x: M, y: ly }, end: { x: M + W, y: ly }, thickness: 0.35, color: LINE });
    divisorias(f, ly, H_LIN);
    ly -= H_LIN;
  }
  legenda(f);
}

function desenharLinha(f, m, ly) {
  const { page, font, bold, W } = f;
  divisorias(f, ly, m.hCel);
  let cx = M;
  COLS.forEach((c, k) => {
    const larg = W * c.w;
    const { tam, linhas, fnt, cor } = m.celulas[k];
    linhas.forEach((ln, j) => {
      const px = c.meio ? cx + (larg - fnt.widthOfTextAtSize(ln, tam)) / 2 : cx + 4;
      page.drawText(ln, { x: px, y: ly - 9 - j * ENTRE, size: tam, font: fnt, color: cor });
    });
    cx += larg;
  });
  if (!m.obs.length) return;
  const yObs = ly - m.hCel - 7;
  page.drawText("Obs.:", { x: M + 4, y: yObs, size: TAM_OBS, font: bold, color: GRAY });
  m.obs.forEach((ln, j) => page.drawText(ln, { x: M + 4 + larguraRotuloObs(f), y: yObs - j * ENTRE_OBS, size: TAM_OBS, font, color: DARK }));
}

function legenda(f) {
  const { page, font, bold, W } = f;
  const topoLeg = f.bloco(ALTURA_LEGENDA);
  f.rotulo(M + 7, topoLeg - 9, "LEGENDA (Legend)");
  // ⚠ FORM. SGQ - 012 é a identidade do formulário no SGQ. Está no modelo e no emitido, e
  // é por ele que a Qualidade sabe qual versão da folha está lendo.
  page.drawText("FORM. SGQ - 012", {
    x: M + W - bold.widthOfTextAtSize("FORM. SGQ - 012", 5.6) - 7,
    y: topoLeg - 9, size: 5.6, font: bold, color: GRAY,
  });
  LEGENDA.forEach((ln, i) => {
    page.drawText(san(ln), { x: M + 7, y: topoLeg - 19 - i * 8.5, size: 5.6, font, color: GRAY });
  });
}
