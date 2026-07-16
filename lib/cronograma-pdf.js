import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

// CRONOGRAMA em PDF (pdf-lib) — visão de Gantt pro cliente: lista de tarefas
// (início / fim / %) + barras numa linha do tempo com faixa de meses e grade
// semanal. Padrão visual Torg (navy/laranja). A4 paisagem, paginado.

const PW = 841.89, PH = 595.28;
const M = 32;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const BLUE = rgb(0.02, 0.43, 0.67);
const BLUE_LT = rgb(0.80, 0.90, 0.97);
const DARK = rgb(0.13, 0.17, 0.23);
const GRAY = rgb(0.42, 0.49, 0.56);
const LINE = rgb(0.85, 0.88, 0.91);
const GRID = rgb(0.93, 0.95, 0.97);
const LIGHT = rgb(0.965, 0.975, 0.985);
const GREEN = rgb(0.13, 0.55, 0.33);
const WHITE = rgb(1, 1, 1);
const LINK = rgb(0.36, 0.45, 0.58); // linhas de vínculo antecessora→sucessora

const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").replace(/[   ]/g, " ").split("").map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const DIA = 86400000;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmtD = (d) => { if (!d) return "—"; const x = new Date(d); if (isNaN(x)) return "—"; return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}`; };
const utc0 = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()); };

export async function gerarCronogramaPDF(cronograma, tarefas, now = new Date()) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const wid = (s, f, sz) => f.widthOfTextAtSize(san(s), sz);
  const fit = (str, f, size, maxW) => { let s = san(str); if (f.widthOfTextAtSize(s, size) <= maxW) return s; while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1); return s + "…"; };

  const ts = [...(tarefas || [])].sort((a, b) => (a.uidMpp || 0) - (b.uidMpp || 0));
  const comData = ts.filter((t) => t.dataInicioPrevista && t.dataFimPrevista);
  const starts = comData.map((t) => utc0(t.dataInicioPrevista));
  const finishes = comData.map((t) => utc0(t.dataFimPrevista));
  // A linha do tempo SEMPRE abraça todas as tarefas. O período gravado no
  // cronograma (dataInicio/dataFim) pode estar defasado — ele não acompanha
  // edições de data que não cascateiam — e confiar só nele espremia a tarefa
  // que caiu fora numa lasquinha na borda do gráfico.
  const t0 = Math.min(
    cronograma.dataInicio ? utc0(cronograma.dataInicio) : Infinity,
    ...(starts.length ? starts : [utc0(now)]),
  );
  const t1 = Math.max(
    cronograma.dataFim ? utc0(cronograma.dataFim) : -Infinity,
    ...(finishes.length ? finishes : [t0 + 30 * DIA]),
  );
  const span = Math.max(DIA, t1 - t0);

  // % concluído geral (média ponderada por duração)
  const pesoTot = ts.reduce((a, t) => a + Math.max(1, t.duracaoDias || 1), 0);
  const pctGeral = pesoTot > 0 ? ts.reduce((a, t) => a + Math.max(1, t.duracaoDias || 1) * (t.percentualRealizado || 0), 0) / pesoTot : 0;

  // Colunas
  const cTarefa = M, wTarefa = 220;
  const cIni = cTarefa + wTarefa, wIni = 46;
  const cFim = cIni + wIni, wFim = 46;
  const cPct = cFim + wFim, wPct = 34;
  const tlX = cPct + wPct + 6;
  const tlW = PW - M - tlX;
  const xOf = (ms) => tlX + Math.min(tlW, Math.max(0, ((ms - t0) / span) * tlW));

  const bandH = 46, topInfo = 22, headH = 26;
  const rowH = 15;
  const bodyTop = PH - bandH - topInfo - headH; // topo da 1ª linha de tarefas
  const bodyBottom = 34; // rodapé
  const rowsPorPag = Math.max(1, Math.floor((bodyTop - bodyBottom) / rowH));

  const dataEmissao = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const info = [cronograma.opNumero && `OP ${cronograma.opNumero}`, cronograma.op?.cliente, cronograma.titulo].filter(Boolean).join("  ·  ");
  const periodo = `${fmtD(t0)}/${new Date(t0).getUTCFullYear()} — ${fmtD(t1)}/${new Date(t1).getUTCFullYear()}`;

  let page;
  const chrome = (gridBottom) => {
    page = pdf.addPage([PW, PH]);
    // faixa de topo
    page.drawRectangle({ x: 0, y: PH - bandH, width: PW, height: bandH, color: NAVY });
    page.drawRectangle({ x: 0, y: PH - bandH, width: PW, height: 3, color: ORANGE });
    if (logo) { const lw = 82, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: PH - bandH / 2 - lh / 2, width: lw, height: lh }); }
    page.drawText("CRONOGRAMA", { x: PW - M - wid("CRONOGRAMA", bold, 15), y: PH - 26, size: 15, font: bold, color: WHITE });
    page.drawText(san(`Emitido em ${dataEmissao}`), { x: PW - M - wid(`Emitido em ${dataEmissao}`, font, 8.5), y: PH - 40, size: 8.5, font, color: rgb(0.75, 0.82, 0.92) });
    // linha de info — título ganha toda a largura à esquerda do período
    const iy = PH - bandH - 15;
    const periodoTxt = san(`Período: ${periodo}  ·  ${pctGeral.toFixed(0)}% concluído`);
    const periodoW = wid(periodoTxt, font, 9);
    page.drawText(fit(info, bold, 10, PW - 2 * M - periodoW - 20), { x: M, y: iy, size: 10, font: bold, color: NAVY });
    page.drawText(periodoTxt, { x: PW - M - periodoW, y: iy, size: 9, font, color: GRAY });

    const yHeadTop = PH - bandH - topInfo;
    // cabeçalho de colunas
    page.drawRectangle({ x: 0, y: yHeadTop - headH, width: PW, height: headH, color: LIGHT, borderColor: LINE, borderWidth: 0.5 });
    const hc = (t, x, w, right) => { const s = fit(t, bold, 8, w - 6); page.drawText(s, { x: right ? x + w - 4 - bold.widthOfTextAtSize(s, 8) : x + 4, y: yHeadTop - headH + 9, size: 8, font: bold, color: GRAY }); };
    hc("TAREFA", cTarefa, wTarefa); hc("INÍCIO", cIni, wIni, true); hc("FIM", cFim, wFim, true); hc("%", cPct, wPct, true);

    // faixa de meses + grade semanal — só até a última linha usada da página
    let m = new Date(Date.UTC(new Date(t0).getUTCFullYear(), new Date(t0).getUTCMonth(), 1));
    let alt = false;
    while (+m <= t1) {
      const mEnd = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1);
      const x0 = xOf(Math.max(t0, +m)), x1 = xOf(Math.min(t1, mEnd));
      if (x1 - x0 > 1) {
        if (alt) page.drawRectangle({ x: x0, y: gridBottom, width: x1 - x0, height: yHeadTop - gridBottom, color: rgb(0.985, 0.99, 0.995) });
        page.drawLine({ start: { x: x0, y: yHeadTop }, end: { x: x0, y: gridBottom }, thickness: 0.5, color: LINE });
        const lbl = `${MESES[m.getUTCMonth()]}/${String(m.getUTCFullYear()).slice(2)}`;
        if (x1 - x0 > wid(lbl, bold, 7.5) + 4) page.drawText(lbl, { x: x0 + (x1 - x0) / 2 - wid(lbl, bold, 7.5) / 2, y: yHeadTop - headH + 9, size: 7.5, font: bold, color: GRAY });
      }
      alt = !alt;
      m = new Date(mEnd);
    }
    // grade semanal (segunda a segunda)
    let wkStart = t0 - ((new Date(t0).getUTCDay() + 6) % 7) * DIA;
    for (let w = wkStart; w <= t1; w += 7 * DIA) { if (w <= t0) continue; page.drawLine({ start: { x: xOf(w), y: yHeadTop - headH }, end: { x: xOf(w), y: gridBottom }, thickness: 0.4, color: GRID }); }
    page.drawLine({ start: { x: 0, y: yHeadTop - headH }, end: { x: PW, y: yHeadTop - headH }, thickness: 0.6, color: LINE });
  };

  const legenda = () => {
    const ly = 20; let lx = M;
    const item = (cor, txt, diamante) => {
      if (diamante) { page.drawRectangle({ x: lx, y: ly - 1, width: 6, height: 6, color: NAVY, rotate: degrees(45) }); }
      else page.drawRectangle({ x: lx, y: ly - 1.5, width: 14, height: 6, color: cor });
      lx += (diamante ? 12 : 18); page.drawText(txt, { x: lx, y: ly - 2, size: 7.5, font, color: GRAY }); lx += wid(txt, font, 7.5) + 14;
    };
    item(BLUE_LT, "Previsto"); item(BLUE, "Realizado"); item(NAVY, "Marco", true);
    page.drawText(san("TORG METAL"), { x: PW - M - wid("TORG METAL", bold, 7.5), y: ly - 2, size: 7.5, font: bold, color: GRAY });
  };

  const paginas = [];
  for (let i = 0; i < ts.length; i += rowsPorPag) paginas.push(ts.slice(i, i + rowsPorPag));
  if (!paginas.length) paginas.push([]);

  paginas.forEach((rows) => {
    const gridBottom = Math.max(bodyBottom, bodyTop - rows.length * rowH);
    chrome(gridBottom);
    let y = bodyTop;
    const pos = {}; // id da tarefa → { cy, x0, x1 } das barras desta página (pros vínculos)
    rows.forEach((t, i) => {
      const rowTop = y, cy = rowTop - rowH / 2;
      if (i % 2 === 1) page.drawRectangle({ x: 0, y: rowTop - rowH, width: tlX - 2, height: rowH, color: rgb(0.985, 0.988, 0.992) });
      // nome (indentado por outlineLevel)
      const ind = Math.max(0, (t.outlineLevel || 1) - 1) * 9;
      const nomeF = t.isSummary ? bold : font;
      page.drawText(fit(t.nome, nomeF, 8, wTarefa - 8 - ind), { x: cTarefa + 4 + ind, y: cy - 3, size: 8, font: nomeF, color: DARK });
      const tri = (x, w, txt) => { const s = fit(txt, font, 7.5, w - 6); page.drawText(s, { x: x + w - 4 - font.widthOfTextAtSize(s, 7.5), y: cy - 3, size: 7.5, font, color: GRAY }); };
      tri(cIni, wIni, fmtD(t.dataInicioPrevista)); tri(cFim, wFim, fmtD(t.dataFimPrevista));
      const pct = Math.round(t.percentualRealizado || 0);
      tri(cPct, wPct, `${pct}%`);
      // barra — decidida pelas DATAS (duracaoDias nem sempre vem preenchido no
      // import/manual; só o "Gerar Datas" preenche). Barra quando fim > início;
      // marco (losango) só em duração zero de fato: sem fim ou fim <= início.
      if (t.dataInicioPrevista) {
        const ini = utc0(t.dataInicioPrevista);
        const fim = t.dataFimPrevista ? utc0(t.dataFimPrevista) : NaN;
        if (!isNaN(ini)) {
          if (isNaN(fim) || fim <= ini) {
            const dx = xOf(ini);
            page.drawRectangle({ x: dx - 3, y: cy - 3, width: 6, height: 6, color: NAVY, rotate: degrees(45) }); // marco
            pos[t.id] = { cy, x0: dx, x1: dx };
          } else {
            const bx0 = xOf(ini), bx1 = Math.max(bx0 + 3, xOf(fim + DIA));
            const bw = bx1 - bx0;
            pos[t.id] = { cy, x0: bx0, x1: bx1 };
            if (t.isSummary) {
              page.drawRectangle({ x: bx0, y: cy - 1.5, width: bw, height: 3, color: NAVY });
              page.drawRectangle({ x: bx0, y: cy - 4, width: 2.5, height: 5, color: NAVY });
              page.drawRectangle({ x: bx1 - 2.5, y: cy - 4, width: 2.5, height: 5, color: NAVY });
            } else {
              page.drawRectangle({ x: bx0, y: cy - 4, width: bw, height: 8, color: BLUE_LT, borderColor: BLUE, borderWidth: 0.5 });
              if (pct > 0) page.drawRectangle({ x: bx0, y: cy - 4, width: bw * Math.min(100, pct) / 100, height: 8, color: BLUE });
            }
          }
        }
      }
      page.drawLine({ start: { x: 0, y: rowTop - rowH }, end: { x: PW, y: rowTop - rowH }, thickness: 0.3, color: GRID });
      y -= rowH;
    });
    // Vínculos (antecessora → sucessora, finish-to-start): do fim da antecessora
    // ao início da sucessora, em cotovelo. Só quando as duas estão nesta página.
    rows.forEach((t) => {
      const dst = pos[t.id];
      if (!dst) return;
      for (const predId of (t.antecessoraIds || [])) {
        const src = pos[predId];
        if (!src || predId === t.id) continue; // antecessora em outra página / inválida
        const x1 = src.x1, y1 = src.cy;   // fim da antecessora
        const x2 = dst.x0, y2 = dst.cy;   // início da sucessora
        const xr = x1 + 5;                // sai um pouco à direita antes de descer
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: xr, y: y1 }, thickness: 0.5, color: LINK });
        page.drawLine({ start: { x: xr, y: y1 }, end: { x: xr, y: y2 }, thickness: 0.5, color: LINK });
        page.drawLine({ start: { x: xr, y: y2 }, end: { x: x2, y: y2 }, thickness: 0.5, color: LINK });
        // setinha apontando pra dentro do início da sucessora
        page.drawLine({ start: { x: x2 - 3, y: y2 + 2 }, end: { x: x2, y: y2 }, thickness: 0.5, color: LINK });
        page.drawLine({ start: { x: x2 - 3, y: y2 - 2 }, end: { x: x2, y: y2 }, thickness: 0.5, color: LINK });
      }
    });
    // fechamento da tabela + legenda no rodapé
    page.drawLine({ start: { x: 0, y: gridBottom }, end: { x: PW, y: gridBottom }, thickness: 0.6, color: LINE });
    legenda();
  });

  const bytes = await pdf.save();
  const slug = String(cronograma.opNumero || cronograma.titulo || "cronograma").replace(/[^\w.-]+/g, "-");
  return { bytes, filename: `cronograma-${slug}.pdf` };
}
