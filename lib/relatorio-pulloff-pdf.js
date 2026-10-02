import "server-only";
import { abrirDocumento, M, san, quebrarTexto, DARK, GRAY, LINE, SOFT, GREEN, RED } from "./relatorio-form-pdf";
import { arredondar } from "./sais-campos";
import { adesaoImpressa, camposCabecalhoPullOff, dataDoEnsaioPullOff, dolliesPullOff, esquemaPullOff, espessuraTotal, mediaAdesao, mediaEhMinima, LEGENDA_ROMPIMENTO } from "./pulloff-campos";
import { abrirSuperficie, faixa, identificacao, linha, nota, pecaNoCorpo, fotosNoCorpo, fecharSuperficie } from "./relatorio-superficie-pdf";
import { dataCurtaBR } from "./recebimento-tinta-campos";
import { numRNC } from "./nao-conformidade";

// RELATÓRIO DE ENSAIO DE TRAÇÃO — PULL-OFF (RPO) — modelo "Relatório de Pull-off.xlsx".
//
// ⚠ A ORDEM DOS BLOCOS É A DO MODELO: identificação, INFORMAÇÕES, CONDIÇÕES DA FIXAÇÃO E CLIMÁTICAS,
// ESQUEMA DE PINTURA, RESULTADOS — ROMPIMENTO (cinco dollies e a média), LAUDO com o nº da RNC, a legenda
// dos padrões de rompimento, observações, REGISTRO FOTOGRÁFICO e as assinaturas.

export const TITULO_PULLOFF = "RELATÓRIO DE ENSAIO DE TRAÇÃO — PULL-OFF";
const SUBTITULO = "Ensaio de Adesão — Pull-Off — ASTM D-4541";

// ⚠ OS FORMATOS DA PLANILHA: a média com duas casas fixas ("6,90", não "6,9") e a espessura total inteira
// ("121", não "120,6") — é o que as células do modelo mostram
const BR = (v, casas = 2) => (v == null ? "" : arredondar(v, casas).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
// o que foi DIGITADO, só com vírgula ("12.5" sai "12,5"); o que não é número sai como veio
const lido = (v) => { const s = String(v ?? "").trim(); return /^-?\d+\.\d+$/.test(s) ? s.replace(".", ",") : s; };

/**
 * Uma tabela simples: cabeçalho cinza e linhas; cada coluna { t, w (fração), meio }. As linhas crescem com o
 * texto. Com `titulo`, a faixa cinza da seção vem junto e nunca fica sozinha no pé da folha.
 */
export function tabela(fl, colunas, linhas, { tam = 7.2, titulo = null } = {}) {
  const { font, bold, W } = fl.f;
  const hCab = 16, ENT = 8.5;
  const celulas = linhas.map((ln) => colunas.map((c, i) => quebrarTexto(String(ln.valores[i] ?? ""), ln.negrito ? bold : (i === 0 ? font : bold), tam, W * c.w - 12)));
  const hLinhas = celulas.map((cs) => 14 + (Math.max(1, ...cs.map((l) => l.length)) - 1) * ENT);
  const alt = hCab + hLinhas.reduce((a, b) => a + b, 0);
  if (titulo) faixa(fl, titulo, alt);
  fl.reservar(alt);
  const f = fl.f, page = f.page;
  const topo = f.bloco(alt);
  page.drawRectangle({ x: M, y: topo - hCab, width: W, height: hCab, color: SOFT });
  let x = M;
  colunas.forEach((c) => {
    const larg = W * c.w;
    const t = san(c.t);
    page.drawText(t, { x: c.meio ? x + (larg - bold.widthOfTextAtSize(t, 6.6)) / 2 : x + 6, y: topo - 11, size: 6.6, font: bold, color: GRAY });
    x += larg;
  });
  let y = topo - hCab;
  celulas.forEach((cs, r) => {
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.4, color: LINE });
    if (linhas[r].fundo) page.drawRectangle({ x: M, y: y - hLinhas[r], width: W, height: hLinhas[r], color: SOFT });
    let cx = M;
    colunas.forEach((c, i) => {
      const larg = W * c.w;
      const fnt = linhas[r].negrito || i > 0 ? bold : font;
      cs[i].forEach((ln, j) => {
        page.drawText(ln, { x: c.meio ? cx + (larg - fnt.widthOfTextAtSize(ln, tam)) / 2 : cx + 6, y: y - 10 - j * ENT, size: tam, font: fnt, color: DARK });
      });
      cx += larg;
    });
    y -= hLinhas[r];
  });
  // ⚠ as divisórias de coluna DEPOIS das linhas: desenhadas antes, o fundo cinza das linhas de total/média
  // as cobria e a linha parecia uma faixa só (verificação de 02/10/2026)
  let xd = M;
  colunas.forEach((c, i) => {
    if (i > 0) page.drawLine({ start: { x: xd, y: topo }, end: { x: xd, y: topo - alt }, thickness: 0.6, color: LINE });
    xd += W * c.w;
  });
}

/**
 * O laudo do modelo: "( ) Aprovado ( ) Reprovado" e, ao lado, o nº da RNC.
 * ⚠ O nº da RNC QUEBRA LINHA em vez de cortar com "…": a tela aceita 120 caracteres ("RNC-015/26 e RNC-016/26
 * (ver PA-003)…") e a célula, numa linha só, cerca de 38.
 */
function linhaLaudoRnc(fl, laudo, rnc) {
  const f0 = fl.f;
  const linhasRnc = quebrarTexto(rnc || "", f0.bold, 8, f0.W * 0.42 - 56);
  const alt = Math.max(20, 8 + linhasRnc.length * 9.5);
  fl.reservar(alt);
  const f = fl.f;
  const t = f.bloco(alt);
  f.page.drawText("LAUDO:", { x: M + 7, y: t - 13, size: 7, font: f.bold, color: GRAY });
  ["APROVADO", "REPROVADO"].forEach((op, i) => {
    const marcado = laudo === op;
    const cor = op === "APROVADO" ? GREEN : RED;
    const x = M + 60 + i * 110;
    f.page.drawRectangle({ x, y: t - 15, width: 9, height: 9, borderColor: LINE, borderWidth: 0.8 });
    if (marcado) f.page.drawText("X", { x: x + 1.8, y: t - 13.2, size: 8, font: f.bold, color: cor });
    f.page.drawText(op === "APROVADO" ? "Aprovado" : "Reprovado", { x: x + 14, y: t - 13, size: 8, font: f.bold, color: marcado ? cor : GRAY });
  });
  const xr = M + f.W * 0.58;
  f.page.drawLine({ start: { x: xr, y: t }, end: { x: xr, y: t - alt }, thickness: 0.6, color: LINE });
  f.page.drawText("RNC Nº:", { x: xr + 7, y: t - 13, size: 7, font: f.bold, color: GRAY });
  linhasRnc.forEach((ln, i) => f.page.drawText(ln, { x: xr + 48, y: t - 13 - i * 9.5, size: 8, font: f.bold, color: DARK }));
}

export async function gerarPullOffPDF({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null }) {
  const doc = await abrirDocumento();
  const resultados = rel.resultados || {};
  const res = camposCabecalhoPullOff(rel);
  const lista = Array.isArray(fotos) ? fotos.filter(Boolean) : [];

  const fl = abrirSuperficie(doc, rel, { titulo: TITULO_PULLOFF, cliente, assinaturas });
  faixa(fl, SUBTITULO);
  identificacao(fl, rel, res, { cliente, obra, refCliente, dataIso: dataDoEnsaioPullOff(resultados), semNorma: true });

  // ── informações ──
  faixa(fl, "INFORMAÇÕES", 16);
  linha(fl, [["NORMAS:", res.normas || "", 0.5], ["ADESIVO:", res.adesivo || "", 0.5]]);
  const peca = pecaNoCorpo(fl.f, res.peca || "");
  linha(fl, [["VALIDADE DO ADESIVO:", dataCurtaBR(res.validadeAdesivo), 0.38], ["PEÇA INSPECIONADA:", peca.celula, 0.62]]);
  linha(fl, [["APARELHO:", res.aparelho || "", 0.4], ["MODELO:", res.apModelo || "", 0.34], ["PISTÃO:", res.pistao || "", 0.26]]);

  // ── condições da fixação e climáticas ──
  tabela(fl, [
    { t: "URA %", w: 0.14, meio: true }, { t: "TA °C", w: 0.14, meio: true }, { t: "TS °C", w: 0.14, meio: true },
    { t: "PO °C", w: 0.14, meio: true }, { t: "Data Fixação", w: 0.22, meio: true }, { t: "Data Arrancamento", w: 0.22, meio: true },
  ], [{ valores: [lido(res.ura), lido(res.ta), lido(res.ts), lido(res.po), dataCurtaBR(res.dataFixacao), dataCurtaBR(res.dataArrancamento)] }],
  { titulo: "CONDIÇÕES DA FIXAÇÃO E CLIMÁTICAS" });

  // ── esquema de pintura ──
  const esquema = esquemaPullOff(resultados);
  const total = espessuraTotal(resultados);
  tabela(fl, [{ t: "Demãos", w: 0.5 }, { t: "Espessura (µm)", w: 0.5, meio: true }], [
    ...esquema.map((e, i) => ({ valores: [`${i + 1}ª Demão`, lido(e)] })),
    { valores: ["Espessura Total (µm)", BR(total, 0)], negrito: true, fundo: true },
  ], { titulo: "ESQUEMA DE PINTURA" });

  // ── resultados: os cinco dollies ──
  const dollies = dolliesPullOff(resultados);
  const media = mediaAdesao(resultados);
  tabela(fl, [
    { t: "Dolly", w: 0.12, meio: true }, { t: "Adesão (MPa)", w: 0.22, meio: true },
    { t: "Análise do Rompimento (%)", w: 0.38, meio: true }, { t: "Falha: Adesão/Coesão", w: 0.28, meio: true },
  ], [
    ...dollies.map((d) => ({ valores: [String(d.numero), adesaoImpressa(d), d.rompimento || "", d.falha || ""] })),
    // ⚠ dolly sem ruptura entra pelo limite: a média também é um mínimo, e diz isso
    { valores: ["Média", media == null ? "" : `${mediaEhMinima(resultados) ? "> " : ""}${BR(media, 2)}`, "", ""], negrito: true, fundo: true },
  ], { titulo: "RESULTADOS — ROMPIMENTO" });

  // o laudo é o "Resultado da inspeção" (ver lib/pulloff-campos); a RNC, a digitada ou a aberta pela reprovação
  // ⚠ a aberta pela reprovação, SÓ quando este laudo é reprovado: a RNC é uma por relatório (lib/rnc-de-inspecao),
  // e o R01 aprovado sairia com o número da reprovação do R00 ao lado de "Aprovado"
  const laudo = String(rel.resultadoInspecao || "").toUpperCase();
  const rnc = String(resultados.rncNumero || "").trim() || (laudo === "REPROVADO" && rel.rnc?.numero ? numRNC(rel.rnc.numero, rel.rnc.ano) : "");
  linhaLaudoRnc(fl, laudo, rnc);

  faixa(fl, "PADRÕES PARA ANÁLISE DO ROMPIMENTO", 14);
  nota(fl, LEGENDA_ROMPIMENTO);

  fl.texto("OBSERVAÇÕES:", rel.observacoes || "");
  fl.instrumentos(rel.equipamentos);
  const resto = await fotosNoCorpo(doc, fl, lista);
  if (peca.completa) fl.texto("RELAÇÃO COMPLETA DAS PEÇAS INSPECIONADAS:", peca.completa);
  return fecharSuperficie(doc, fl, rel, resto, { titulo: TITULO_PULLOFF, cliente, obra, assinaturas });
}
