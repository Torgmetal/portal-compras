import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { situacaoAtividade, respondida } from "@/lib/ata-status";

// ATA DE REUNIÃO em PDF (pdf-lib) — layout padrão Torg (navy + faixa laranja +
// logo, mesma linguagem de lib/relatorio-status-pdf.js e lib/databook-pdf.js).
// Traz identificação (nº = semana ISO + revisão), pauta, envolvidos com o
// aceite de recebimento e as atividades AGRUPADAS POR OP com resposta/evidência.
// A4 retrato, paginado, rodapé com selo ISO.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const BLUE = rgb(0, 110 / 255, 171 / 255);
const BLUE_LT = rgb(0.925, 0.957, 0.988);
const DARK = rgb(0.16, 0.2, 0.27);
const GRAY = rgb(0.34, 0.43, 0.49);
const LINE = rgb(0.85, 0.88, 0.91);
const GREEN = rgb(0.02, 0.45, 0.33);
const AMBER = rgb(0.65, 0.38, 0.03);
const RED = rgb(0.7, 0.11, 0.11);
const BLUE_ST = rgb(0.12, 0.25, 0.69);
const LIGHT = rgb(0.96, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);

const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").replace(/[   ]/g, " ").split("")
  .map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");

// situação da atividade (ATRASADA é derivada do prazo — ver lib/ata-status.js)
const STATUS_ATV = {
  PENDENTE: { txt: "PENDENTE", cor: AMBER },
  ATRASADA: { txt: "ATRASADA", cor: RED },
  EM_ANDAMENTO: { txt: "EM ANDAMENTO", cor: BLUE_ST },
  CONCLUIDA: { txt: "CONCLUÍDA", cor: GREEN },
};

const SETOR_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras", PRODUCAO: "Produção", PCP: "PCP", PLANEJAMENTO: "Planejamento", EXPEDICAO: "Expedição", QUALIDADE: "Qualidade", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro", RH: "RH", DIRETORIA: "Diretoria" };
const sl = (s) => SETOR_LABEL[s] || s || "sem setor";
const numAta = (n) => `ATA-${String(n).padStart(3, "0")}`;
const rev = (n) => `R${String(n).padStart(2, "0")}`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const opN = (a) => { const n = parseInt(String(a?.op || "").replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : Infinity; };

/**
 * @param {object} ata AtaReuniao com atividades[] e confirmacoes[]
 * @returns {Promise<{ bytes: Uint8Array, filename: string }>}
 */
export async function gerarAtaPDF(ata) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const W = A4[0] - 2 * M;
  let page, y;

  const novaPagina = () => { page = pdf.addPage(A4); y = A4[1] - M; };
  const espaco = (h) => { if (y - h < M + 26) { novaPagina(); return true; } return false; };
  const txt = (s, x, yy, { f = font, size = 9, color = DARK } = {}) => page.drawText(san(s), { x, y: yy, size, font: f, color });
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
        while (f.widthOfTextAtSize(ww, size) > maxW && ww.length > 1) {
          let cut = ww.length;
          while (cut > 1 && f.widthOfTextAtSize(ww.slice(0, cut), size) > maxW) cut--;
          out.push(ww.slice(0, cut)); ww = ww.slice(cut);
        }
        l = ww;
      }
      if (l) out.push(l);
    }
    return out.length ? out : [""];
  };

  const paragrafo = (str, x, maxW, { f = font, size = 9, color = DARK, lh = 12 } = {}) => {
    for (const ln of wrap(str, f, size, maxW)) { espaco(lh); txt(ln, x, y - size, { f, size, color }); y -= lh; }
  };

  /* ── Cabeçalho institucional ─────────────────────────────────── */
  novaPagina();
  page.drawRectangle({ x: 0, y: A4[1] - 104, width: A4[0], height: 104, color: NAVY });
  page.drawRectangle({ x: 0, y: A4[1] - 110, width: A4[0], height: 6, color: ORANGE });
  if (logo) {
    const lw = 118, lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: M, y: A4[1] - 34 - lh, width: lw, height: lh });
  } else {
    txt("TORG METAL", M, A4[1] - 56, { f: bold, size: 18, color: WHITE });
  }
  const tit = "ATA DE REUNIÃO";
  txt(tit, A4[0] - M - wid(tit, bold, 15), A4[1] - 46, { f: bold, size: 15, color: WHITE });
  const cod = `${numAta(ata.numero)} · ${rev(ata.revisao)}`;
  txt(cod, A4[0] - M - wid(cod, bold, 11), A4[1] - 63, { f: bold, size: 11, color: ORANGE });
  const sem = `Semana ISO ${ata.semanaIso}/${ata.ano}`;
  txt(sem, A4[0] - M - wid(sem, font, 8.5), A4[1] - 78, { size: 8.5, color: rgb(0.72, 0.79, 0.88) });
  y = A4[1] - 128;

  /* ── Identificação ───────────────────────────────────────────── */
  for (const ln of wrap(ata.titulo || "Reunião", bold, 14, W)) { txt(ln, M, y - 14, { f: bold, size: 14, color: NAVY }); y -= 18; }
  y -= 2;
  const STATUS_LABEL = { RASCUNHO: "Rascunho", ENVIADA: "Enviada", CONCLUIDA: "Concluída" };
  const meta = [
    `Data da reunião: ${fmtD(ata.dataReuniao)}`,
    `Situação: ${STATUS_LABEL[ata.status] || ata.status}`,
    ata.enviadaEm ? `Emitida em: ${fmtDT(ata.enviadaEm)}` : null,
  ].filter(Boolean).join("   |   ");
  txt(meta, M, y - 9, { size: 8.5, color: GRAY });
  y -= 20;
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 1, color: LINE });
  y -= 16;

  /* ── Pauta ───────────────────────────────────────────────────── */
  if (ata.pauta) {
    espaco(40);
    txt("PAUTA", M, y - 9, { f: bold, size: 9, color: NAVY });
    y -= 16;
    paragrafo(ata.pauta, M, W, { size: 9, color: DARK, lh: 12 });
    y -= 10;
  }

  /* ── Envolvidos ──────────────────────────────────────────────── */
  const envolvidos = Array.isArray(ata.envolvidos) ? ata.envolvidos : [];
  const confs = new Map((ata.confirmacoes || []).map((c) => [String(c.email).toLowerCase(), c]));
  if (envolvidos.length) {
    espaco(46);
    txt("ENVOLVIDOS", M, y - 9, { f: bold, size: 9, color: NAVY });
    y -= 16;
    // cabeçalho da tabela
    const cNome = M + 4, cSetor = M + 210, cAceite = M + 320;
    espaco(16);
    page.drawRectangle({ x: M, y: y - 13, width: W, height: 15, color: LIGHT });
    txt("Nome", cNome, y - 9, { f: bold, size: 7.5, color: GRAY });
    txt("Setor", cSetor, y - 9, { f: bold, size: 7.5, color: GRAY });
    txt("Aceite do recebimento", cAceite, y - 9, { f: bold, size: 7.5, color: GRAY });
    y -= 17;
    for (const e of envolvidos) {
      espaco(14);
      const c = confs.get(String(e.email || "").toLowerCase());
      const ok = !!c?.confirmadoEm;
      txt(e.nome || e.email || "—", cNome, y - 8, { size: 8.5 });
      txt(sl(e.setor), cSetor, y - 8, { size: 8.5, color: GRAY });
      txt(ok ? `Confirmado em ${fmtDT(c.confirmadoEm)}` : "Aguardando confirmação", cAceite, y - 8, { size: 8.5, color: ok ? GREEN : AMBER });
      y -= 13;
      page.drawLine({ start: { x: M, y: y + 3 }, end: { x: A4[0] - M, y: y + 3 }, thickness: 0.4, color: LINE });
    }
    y -= 12;
  }

  /* ── Atividades por OP ───────────────────────────────────────── */
  const atvs = [...(ata.atividades || [])].sort((a, b) => opN(a) - opN(b));
  const grupos = new Map();
  for (const a of atvs) { const k = a.op || ""; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(a); }

  espaco(40);
  txt("ATIVIDADES POR OP", M, y - 9, { f: bold, size: 9, color: NAVY });
  y -= 18;

  if (!atvs.length) {
    txt("Nenhuma atividade registrada nesta ata.", M, y - 9, { size: 9, color: GRAY });
    y -= 14;
  }

  for (const [op, itens] of grupos) {
    const nOk = itens.filter((x) => x.status === "CONCLUIDA").length;
    espaco(34);
    // faixa da OP
    page.drawRectangle({ x: M, y: y - 16, width: W, height: 19, color: BLUE });
    txt(op ? `OP ${op}` : "Sem OP", M + 8, y - 11, { f: bold, size: 9.5, color: WHITE });
    const prog = `${nOk}/${itens.length} concluídas`;
    txt(prog, A4[0] - M - 8 - wid(prog, font, 8), y - 11, { size: 8, color: rgb(0.85, 0.92, 0.98) });
    y -= 24;

    for (const a of itens) {
      const sKey = situacaoAtividade(a, ata); // atrasada sai do prazo, não do status
      const done = respondida(a); // respondida (em andamento ou concluída)
      const descLines = wrap(a.descricao || "", bold, 9, W - 74);
      const respLines = done && a.resposta ? wrap(a.resposta, font, 8.5, W - 20) : [];
      const evidLines = done && a.evidencia ? wrap(`Evidência: ${a.evidencia}`, font, 8, W - 20) : [];
      const alturaBloco = 10 + descLines.length * 11 + 11 + (respLines.length ? respLines.length * 10.5 + 4 : 0) + (evidLines.length ? evidLines.length * 10 : 0) + (done ? 11 : 0) + 8;
      espaco(alturaBloco);

      const topo = y;
      // descrição
      for (const ln of descLines) { txt(ln, M + 8, y - 9, { f: bold, size: 9, color: DARK }); y -= 11; }
      // meta: origem · setor · responsável · prazo
      const metaAtv = [
        a.origemAtaNumero != null ? `em aberto desde a ATA-${String(a.origemAtaNumero).padStart(3, "0")}` : null,
        sl(a.setor), a.responsavel || null, a.prazo ? `prazo ${fmtD(a.prazo)}` : null,
      ].filter(Boolean).join("  ·  ");
      txt(metaAtv, M + 8, y - 8, { size: 7.5, color: GRAY });
      // selo de status (à direita, na linha da descrição)
      const selo = STATUS_ATV[sKey] || STATUS_ATV.PENDENTE;
      txt(selo.txt, A4[0] - M - 8 - wid(selo.txt, bold, 7), topo - 9, { f: bold, size: 7, color: selo.cor });
      y -= 11;

      if (respLines.length || evidLines.length) {
        y -= 3;
        for (const ln of respLines) { espaco(11); txt(ln, M + 14, y - 8, { size: 8.5, color: DARK }); y -= 10.5; }
        for (const ln of evidLines) { espaco(11); txt(ln, M + 14, y - 8, { size: 8, color: GRAY }); y -= 10; }
      }
      if (done) {
        espaco(11);
        txt(`Respondido por ${a.respondidoPor || "—"} em ${fmtDT(a.respondidoEm)}`, M + 14, y - 7, { size: 7, color: rgb(0.6, 0.65, 0.7) });
        y -= 11;
      }
      // barra lateral do bloco (cor do status)
      page.drawRectangle({ x: M, y: y + 2, width: 2.5, height: topo - y - 2, color: selo.cor });
      y -= 8;
    }
    y -= 6;
  }

  /* ── Revisões ────────────────────────────────────────────────── */
  const revisoes = Array.isArray(ata.revisoes) ? ata.revisoes : [];
  if (revisoes.length) {
    espaco(40);
    y -= 4;
    txt("HISTÓRICO DE REVISÕES", M, y - 9, { f: bold, size: 9, color: NAVY });
    y -= 16;
    for (const r of revisoes) {
      espaco(13);
      txt(`${rev(r.n)}  —  ${r.motivo || "—"}  (${r.por || "—"} · ${fmtDT(r.em)})`, M + 4, y - 8, { size: 8, color: GRAY });
      y -= 12;
    }
  }

  /* ── Rodapé paginado ─────────────────────────────────────────── */
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 30 }, end: { x: A4[0] - M, y: 30 }, thickness: 0.5, color: LINE });
    p.drawText(san(`${numAta(ata.numero)} ${rev(ata.revisao)} · Torg Metal · documento controlado (ISO)`), { x: M, y: 19, size: 7, font, color: GRAY });
    const pg = `${i + 1}/${pages.length}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7), y: 19, size: 7, font, color: GRAY });
  });

  const bytes = await pdf.save();
  const filename = `${numAta(ata.numero)}-${rev(ata.revisao)}-semana-${ata.semanaIso}-${ata.ano}.pdf`;
  return { bytes, filename };
}
