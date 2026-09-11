import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { numPA, situacaoItem, situacaoItemLabel, STATUS_PLANO } from "@/lib/plano-acao";
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { refFORM } from "@/lib/sgq-forms";

// PLANO DE AÇÃO 5W2H em PDF (pdf-lib) — A4 PAISAGEM, uma FICHA por ação: "o quê" em destaque,
// "por quê" e "como" em duas colunas largas e onde/quem/quando/quanto ao lado. Padrão Torg (navy +
// filete laranja + logo). Rodapé paginado com selo ISO.
//
// ⚠⚠ ERA UMA TABELA DE 8 COLUNAS A 7,5 pt. Vitor (11/09/2026): "na abertura dos planos de ação dos
// indicadores está bem ruim, está pequeno para visualizar tanto na geração quanto depois do PDF". O
// plano é o papel que vai para a reunião com o responsável — a 7,5 pt ninguém lê de longe, e as
// oito colunas deixavam "o quê" e "como" espremidos em 15 caracteres por linha com dois terços da
// página em branco. A ficha lê de cima para baixo, em 10–11,5 pt, e a página só cresce se a ação
// tiver texto.

const PW = 841.89, PH = 595.28;
const M = 28;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0.16, 0.2, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);
const LINE = rgb(0.82, 0.86, 0.9);
const HEADBG = rgb(0.93, 0.95, 0.97);
const WHITE = rgb(1, 1, 1);
const SIT_COR = { A_FAZER: rgb(0.34, 0.43, 0.49), EM_ANDAMENTO: rgb(0.12, 0.25, 0.69), CONCLUIDO: rgb(0.02, 0.4, 0.27), ATRASADO: rgb(0.7, 0.11, 0.11) };

const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").replace(/[   ]/g, " ").split("").map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

const W = PW - 2 * M;
const SIT_BG = { A_FAZER: rgb(0.93, 0.95, 0.97), EM_ANDAMENTO: rgb(0.89, 0.93, 1), CONCLUIDO: rgb(0.86, 0.95, 0.9), ATRASADO: rgb(0.99, 0.89, 0.89) };
// tipografia da ficha (pt) — o "o quê" é o que se lê primeiro, por isso é o maior
const T = { rotulo: 7.5, oque: 11.5, valor: 10, acomp: 9.5, lhOque: 14.5, lhValor: 13, lhAcomp: 12 };

export async function gerarPlanoAcaoPDF(p) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const wid = (s, f, sz) => f.widthOfTextAtSize(san(s), sz);
  const wrap = (str, f, size, maxW) => {
    const out = [];
    for (const par of san(str).split("\n")) {
      const words = par.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); continue; }
      let l = "";
      for (const w of words) {
        const t = l ? `${l} ${w}` : w;
        if (f.widthOfTextAtSize(t, size) <= maxW) { l = t; continue; }
        if (l) out.push(l);
        let ww = w;
        while (f.widthOfTextAtSize(ww, size) > maxW && ww.length > 1) { let cut = ww.length; while (cut > 1 && f.widthOfTextAtSize(ww.slice(0, cut), size) > maxW) cut--; out.push(ww.slice(0, cut)); ww = ww.slice(cut); }
        l = ww;
      }
      if (l) out.push(l);
    }
    return out.length ? out : [""];
  };

  let page, y;
  const HEADH = 74;

  const chrome = () => {
    page = pdf.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: PH - 62, width: PW, height: 62, color: NAVY });
    page.drawRectangle({ x: 0, y: PH - 66, width: PW, height: 4, color: ORANGE });
    // Altura fixa que cabe na faixa navy (62px) e centralizada verticalmente nela
    // (centro da faixa = PH-31). Antes usava largura fixa e o logo vazava pra baixo.
    if (logo) { const lh = 40, lw = lh / (logo.height / logo.width); page.drawImage(logo, { x: M, y: PH - 31 - lh / 2, width: lw, height: lh }); }
    const t = "PLANO DE AÇÃO 5W2H";
    page.drawText(san(t), { x: PW - M - wid(t, bold, 14), y: PH - 30, size: 14, font: bold, color: WHITE });
    const cod = `${numPA(p.numero)}${p.origem ? ` · ${p.origem}` : ""}`;
    page.drawText(san(cod), { x: PW - M - wid(cod, font, 8.5), y: PH - 46, size: 8.5, font, color: rgb(0.72, 0.79, 0.88) });
    // título + responsável
    for (const ln of wrap(p.titulo || "Plano de ação", bold, 12, PW - 2 * M - 240)) { page.drawText(ln, { x: M + 110, y: PH - 30, size: 12, font: bold, color: WHITE }); break; }
    // ⚠⚠ O NÚMERO CONTRA A META, no cabeçalho. Vitor (02/09/2026): "o PDF de plano de ação que eu
    // digo é o dos indicadores (…) para podermos apresentar para os responsáveis".
    //
    // O plano saía só com a origem em texto ("Indicador Aderência ao Prazo (jul/26)") — quem recebe
    // lê as ações sem saber o TAMANHO do problema. "80% contra meta de 92%" é o que faz a reunião
    // começar no lugar certo; sem isso, discute-se a ação antes de concordar com o desvio.
    //
    // ⚠ Só aparece quando o plano NASCEU de um indicador: plano de RNC não tem meta, e inventar uma
    // linha vazia ali seria pior que não ter.
    if (p.indicador && p.valor != null && p.metaValor != null) {
      const meta = INDICADORES_ISO.find((i) => i.id === p.indicador)?.meta;
      const bateu = meta?.dir === "max" ? Number(p.valor) <= Number(p.metaValor) : Number(p.valor) >= Number(p.metaValor);
      const num = (v) => (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1).replace(".", ","));
      const linha = `${p.processo ? `${p.processo} · ` : ""}${p.mes != null && p.mes >= 0 ? `${String(p.mes + 1).padStart(2, "0")}/${p.ano}` : p.ano || ""}`;
      const res = `Resultado ${num(p.valor)}  ·  Meta ${num(p.metaValor)}`;
      page.drawRectangle({ x: M, y: PH - HEADH + 6, width: PW - 2 * M, height: 20, color: rgb(0.96, 0.97, 0.99) });
      page.drawText(san(linha), { x: M + 8, y: PH - HEADH + 12, size: 8, font, color: GRAY });
      page.drawText(san(res), { x: PW - M - wid(res, bold, 9) - 8, y: PH - HEADH + 12, size: 9, font: bold,
        color: bateu ? rgb(0.11, 0.55, 0.36) : rgb(0.72, 0.22, 0.22) });
      y = PH - HEADH - 18;
    } else {
      y = PH - HEADH;
    }
  };

  chrome();

  const itens = (Array.isArray(p.itens) ? p.itens : []).filter((i) => (i.oque || "").trim());
  const sits = itens.map((it) => situacaoItem(it));

  // linha de resumo: quem responde pelo plano e quantas ações faltam — é o que se pergunta primeiro
  {
    const n = itens.length, conc = sits.filter((s) => s === "CONCLUIDO").length, atr = sits.filter((s) => s === "ATRASADO").length;
    const partes = [`${n} ${n === 1 ? "ação" : "ações"}`, `${conc} ${conc === 1 ? "concluída" : "concluídas"}`];
    if (atr) partes.push(`${atr} ${atr === 1 ? "atrasada" : "atrasadas"}`);
    const resumo = `${p.responsavel ? `Responsável pelo plano: ${p.responsavel}   ·   ` : ""}${partes.join(" · ")}`;
    page.drawText(san(resumo), { x: M, y: y - 12, size: 9.5, font, color: atr ? SIT_COR.ATRASADO : GRAY });
    y -= 26;
  }

  if (!itens.length) { page.drawText("Nenhuma ação cadastrada neste plano.", { x: M, y: y - 16, size: 10, font, color: GRAY }); }

  // ── a ficha de cada ação ──
  const PAD = 12, BAND = 22, GAP = 9;
  const INNER = W - 2 * PAD;
  const COLA = Math.round(INNER * 0.36), COLB = Math.round(INNER * 0.40), COLC = INNER - COLA - COLB - 2 * GAP;
  const rotulo = (txt, x, yy) => page.drawText(san(txt), { x, y: yy, size: T.rotulo, font: bold, color: GRAY });
  const bloco = (txt, f, size, lh, maxW) => { const lines = wrap(txt, f, size, maxW); return { lines, h: lines.length * lh }; };

  itens.forEach((it, idx) => {
    const sit = sits[idx];
    const oque = bloco(it.oque, bold, T.oque, T.lhOque, INNER);
    const porque = bloco(it.porque || "—", font, T.valor, T.lhValor, COLA);
    const como = bloco(it.como || "—", font, T.valor, T.lhValor, COLB);
    // onde/quem em cima, quando/quanto embaixo — 2×2 em vez de empilhado, senão a lateral manda
    // na altura da ficha e cabe uma ação por página
    const CEL = (COLC - GAP) / 2;
    const lado = [["ONDE", it.onde], ["QUEM", it.quem], ["QUANDO", fmtD(it.quando)], ["QUANTO", it.quanto]]
      .map(([r, v]) => ({ r, ...bloco(String(v || "—"), font, T.valor, T.lhValor, CEL) }));
    const linhaH = (a, b) => 10 + Math.max(a.h, b.h) + 6;
    const ladoH = linhaH(lado[0], lado[1]) + linhaH(lado[2], lado[3]);
    const colsH = Math.max(11 + porque.h, 11 + como.h, ladoH);
    const acomp = (it.acompanhamento || "").trim() ? bloco(it.acompanhamento, font, T.acomp, T.lhAcomp, INNER) : null;
    const h = BAND + 8 + 11 + oque.h + 8 + colsH + (acomp ? 8 + 11 + acomp.h : 0) + PAD;

    if (y - h < M + 24 && y < PH - HEADH - 30) chrome();

    // moldura + faixa do cabeçalho
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, borderColor: LINE, borderWidth: 0.6, color: WHITE });
    page.drawRectangle({ x: M, y: y - BAND, width: W, height: BAND, color: HEADBG });
    page.drawText(san(`AÇÃO ${idx + 1}`), { x: M + PAD, y: y - 15, size: 9, font: bold, color: DARK });
    // chip de situação, à direita
    const rot = situacaoItemLabel(sit), cw = wid(rot, bold, 8.5) + 14;
    page.drawRectangle({ x: PW - M - PAD - cw, y: y - 17, width: cw, height: 13, color: SIT_BG[sit] || HEADBG });
    page.drawText(san(rot), { x: PW - M - PAD - cw + 7, y: y - 13.5, size: 8.5, font: bold, color: SIT_COR[sit] || GRAY });
    if (it.quando) { const pz = `Prazo ${fmtD(it.quando)}`; page.drawText(san(pz), { x: PW - M - PAD - cw - 10 - wid(pz, font, 8.5), y: y - 13.5, size: 8.5, font, color: sit === "ATRASADO" ? SIT_COR.ATRASADO : GRAY }); }

    let yy = y - BAND - 8;
    rotulo("O QUÊ", M + PAD, yy - 7); yy -= 11;
    oque.lines.forEach((ln, k) => page.drawText(ln, { x: M + PAD, y: yy - 11 - k * T.lhOque, size: T.oque, font: bold, color: DARK }));
    yy -= oque.h + 8;

    const topo = yy;
    const xa = M + PAD, xb = xa + COLA + GAP, xc = xb + COLB + GAP;
    rotulo("POR QUÊ", xa, topo - 7);
    porque.lines.forEach((ln, k) => page.drawText(ln, { x: xa, y: topo - 11 - 10 - k * T.lhValor, size: T.valor, font, color: DARK }));
    rotulo("COMO", xb, topo - 7);
    como.lines.forEach((ln, k) => page.drawText(ln, { x: xb, y: topo - 11 - 10 - k * T.lhValor, size: T.valor, font, color: DARK }));
    let yl = topo;
    for (const par of [[lado[0], lado[1]], [lado[2], lado[3]]]) {
      par.forEach((l, j) => {
        const x = xc + j * (CEL + GAP);
        rotulo(l.r, x, yl - 7);
        l.lines.forEach((ln, k) => page.drawText(ln, { x, y: yl - 11 - 10 - k * T.lhValor, size: T.valor, font, color: DARK }));
      });
      yl -= linhaH(par[0], par[1]);
    }
    yy = topo - colsH;

    if (acomp) {
      yy -= 8;
      rotulo("ACOMPANHAMENTO", M + PAD, yy - 7); yy -= 11;
      acomp.lines.forEach((ln, k) => page.drawText(ln, { x: M + PAD, y: yy - 10 - k * T.lhAcomp, size: T.acomp, font, color: rgb(0.25, 0.3, 0.36) }));
    }
    y -= h + 10;
  });

  // rodapé em cada página
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: M + 12 }, end: { x: PW - M, y: M + 12 }, thickness: 0.5, color: LINE });
    pg.drawText(san(`${numPA(p.numero)} · Torg Metal · ${refFORM(28)} · plano de ação 5W2H · ${STATUS_PLANO[p.status]?.label || p.status} · documento controlado (ISO)`), { x: M, y: 15, size: 7, font, color: GRAY });
    const pgn = `${i + 1}/${pages.length}`;
    pg.drawText(pgn, { x: PW - M - wid(pgn, font, 7), y: 15, size: 7, font, color: GRAY });
  });

  const bytes = await pdf.save();
  const slug = String(p.titulo || "plano").replace(/[^\w.-]+/g, "-").toLowerCase().slice(0, 40);
  return { bytes, filename: `${numPA(p.numero)}-${slug}.pdf` };
}
