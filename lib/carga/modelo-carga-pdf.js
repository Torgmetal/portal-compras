import "server-only";
// PDF do MODELO DE CARGA para a Expedição: a carga pronta (fotos do 3D), separar as peças por fase,
// formar os volumes e montar camada por camada. A4 paisagem, padrão Torg (faixa navy + filete laranja).
// Veio do protótipo gerar-modelo-carga.mjs (set/2026) que o Vitor aprovou: "faça um modelo para 1 carga
// apenas e precisa ser mais visual" → fotos do 3D por camada; "por fase, não frente" → lista por fase.
//
// As imagens vêm do navegador (o 3D é desenhado lá): { full: { iso, lado, topo }, camadas: [{ ci, iso, topo }] }, JPEG em data URL.
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { faseDaMarca } from "./classificar";
import { resumoDaRegra } from "./ajustes";

const PW = 841.89, PH = 595.28, M = 28, W = PW - 2 * M;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255), ORANGE = rgb(244 / 255, 128 / 255, 31 / 255), DARK = rgb(0.16, 0.2, 0.27), GRAY = rgb(0.34, 0.43, 0.49), LINE = rgb(0.82, 0.86, 0.9), HEADBG = rgb(0.93, 0.95, 0.97), WHITE = rgb(1, 1, 1);
const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").split("").map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TIPO = (u) => u.tipo === "CAIXA" ? "caixa" : u.embalagem?.tipo === "engradado" ? "engradado" : u.gc ? "gc" : u.grade ? (u.degrau ? "degrau" : "grade") : u.tipo === "PACOTE" ? "feixe" : "solta";
const ROT = { caixa: "Caixa de madeira", engradado: "Engradado", gc: "Pacote de guarda-corpo", grade: "Pacote de grade de piso", degrau: "Pacote de degraus", feixe: "Feixe cintado", solta: "Peça solta" };
const COR = { caixa: hex("#c8a165"), engradado: hex("#a8763e"), gc: hex("#4caf7d"), grade: hex("#2aa198"), degrau: hex("#7c9a3a"), feixe: hex("#3b82c4"), solta: hex("#8a94a6") };
const kg = (v) => Math.round(v || 0).toLocaleString("pt-BR"), m1 = (v) => (v / 1000).toFixed(1).replace(".", ","), cm = (v) => Math.round(v / 10);
const dataUrlParaBytes = (d) => { const i = String(d || "").indexOf("base64,"); return i >= 0 ? Buffer.from(d.slice(i + 7), "base64") : null; };

/**
 * @param {object} p  { op, previo, carga (uma carga da simulação), indice, total, perfilNome, imagens }
 * @returns {Promise<{bytes: Uint8Array, filename: string}>}
 */
export async function gerarModeloCargaPDF({ op, previo, carga, indice = 0, total = 1, perfilNome = "", prefixo = "", imagens = {}, estimadas = [], ajustes = {} }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null; try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }
  const jpg = async (d) => { const b = dataUrlParaBytes(d); if (!b) return null; try { return await pdf.embedJpg(b); } catch { return null; } };
  const veic = carga.veiculo, itens = carga.itens || [], byId = new Map(itens.map((u) => [u.id, u]));
  const titulo = `Carga ${indice + 1}${total > 1 ? ` de ${total}` : ""} · Romaneio prévio ${String(previo.numero).padStart(2, "0")} · OP ${op.numero}`;
  let page, y;
  const text = (v, x, yy, size = 10, f = font, color = DARK) => page.drawText(san(v), { x, y: yy, size, font: f, color });
  const wid = (s, f, size) => f.widthOfTextAtSize(san(s), size);
  const corta = (s, f, size, maxW) => { let t = san(s); while (t.length > 1 && f.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -1); return t.length < san(s).length ? t.replace(/.$/, "…") : t; };
  const novaPagina = (secao) => {
    page = pdf.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: PH - 52, width: PW, height: 52, color: NAVY }); page.drawRectangle({ x: 0, y: PH - 55, width: PW, height: 3, color: ORANGE });
    if (logo) page.drawImage(logo, { x: M, y: PH - 42, width: logo.width * 30 / logo.height, height: 30 });
    text("MODELO DE CARGA", M + 95, PH - 24, 15, bold, WHITE);
    text(titulo, M + 95, PH - 40, 9, font, WHITE);
    const dir = `${op.cliente || ""}${op.obra ? ` · ${op.obra}` : ""}`; text(corta(dir, font, 9, 300), PW - M - wid(corta(dir, font, 9, 300), font, 9), PH - 24, 9, font, WHITE);
    const sub = `${veic.nome} · embalagem ${perfilNome}`; text(sub, PW - M - wid(sub, font, 8), PH - 40, 8, font, WHITE);
    page.drawText(san(secao), { x: M, y: PH - 76, size: 13, font: bold, color: NAVY });
    const rod = `Torg Metal · gerado em ${new Date().toLocaleDateString("pt-BR")} · página ${pdf.getPageCount()}`; page.drawText(san(rod), { x: PW - M - wid(rod, font, 7), y: 14, size: 7, font, color: GRAY });
    y = PH - 90;
  };
  const chip = (x, yy, n, cor, size = 9) => { const w = Math.max(16, wid(String(n), bold, size) + 8); page.drawRectangle({ x, y: yy - 3, width: w, height: size + 6, color: cor }); text(String(n), x + (w - wid(String(n), bold, size)) / 2, yy, size, bold, WHITE); return w; };
  const imagem = async (d, x, yy, w, h) => { const im = await jpg(d); if (!im) { page.drawRectangle({ x, y: yy, width: w, height: h, color: HEADBG }); text("sem imagem", x + 8, yy + h / 2, 9, font, GRAY); return; } const s = Math.min(w / im.width, h / im.height); page.drawImage(im, { x, y: yy + (h - im.height * s) / 2, width: im.width * s, height: im.height * s }); page.drawRectangle({ x, y: yy, width: w, height: h, borderColor: LINE, borderWidth: 0.5 }); };

  // ── página 1: a carga pronta ──
  novaPagina("A carga pronta");
  const kpis = [[`${kg(carga.peso)} kg`, `${Math.round(100 * carga.peso / veic.pesoMax)} % do veículo`], [`${m1(carga.altura)} m`, `altura da carga (útil ${m1(veic.alturaUtil)} m)`], [`${carga.volumes}`, "volumes"], [`${carga.chao} %`, "do chão ocupado"]];
  kpis.forEach(([v, l], i) => { const x = M + i * (W / 4); page.drawRectangle({ x, y: y - 22, width: W / 4 - 6, height: 30, color: HEADBG }); text(v, x + 8, y - 12, 13, bold, NAVY); text(l, x + 8 + wid(v, bold, 13) + 6, y - 12, 8, font, GRAY); });
  y -= 34;
  // as fotos vêm do navegador em 1200×560 (proporção 2,14): molduras na mesma proporção, sem faixa branca
  const ASP = 1200 / 560, wBig = Math.round(W * 0.58), hBig = Math.round(wBig / ASP), wPeq = W - wBig - 10, hPeq = Math.round(wPeq / ASP);
  await imagem(imagens.full?.iso, M, y - hBig, wBig, hBig);
  await imagem(imagens.full?.lado, M + wBig + 10, y - hPeq, wPeq, hPeq);
  await imagem(imagens.full?.topo, M + wBig + 10, y - 2 * hPeq - 8, wPeq, hPeq);
  text("vista 3D — o número é o volume (ver página 3)", M, y - hBig - 10, 7, font, GRAY);
  text("vista lateral", M + wBig + 10, y - hPeq - 9, 7, font, GRAY); text("vista de cima — frente à esquerda", M + wBig + 10, y - 2 * hPeq - 17, 7, font, GRAY);
  let ly = y - hBig - 28, lx = M; for (const k of Object.keys(ROT).filter((k) => itens.some((u) => TIPO(u) === k))) { page.drawRectangle({ x: lx, y: ly - 2, width: 9, height: 9, color: COR[k] }); text(ROT[k], lx + 12, ly, 8); lx += wid(ROT[k], font, 8) + 24; }
  ly -= 22; const mad = carga.madeira?.pecas || {};
  const kmad = [[String(mad.caibro || 0), "caibros 5x6 cm", "peças de 3 m"], [String(mad.sarrafo || 0), "sarrafos 2,5x5 cm", "peças de 3 m"], [String(mad.tabua || 0), "tábuas 2,5x30 cm", "peças de 3 m"], [String(itens.filter((u) => TIPO(u) !== "solta").length), "volumes a cintar", "fita PET + cinta catraca"]];
  // ⚠ peça com peso mas fora do IFC: entrou em caixa com medida estimada — a Expedição tem de saber antes de carregar (Vitor, 13/09/2026)
  if (estimadas.length) { const ly2 = ly - 44; page.drawRectangle({ x: M, y: ly2 - 24, width: wBig, height: 30, color: hex("#FFF7ED"), borderColor: ORANGE, borderWidth: 0.8 });
    text(`ATENÇÃO: ${estimadas.length} ${estimadas.length === 1 ? "peça tem peso mas não está no IFC" : "peças têm peso mas não estão no IFC"} — em caixa com medida estimada, conferir no pátio`, M + 8, ly2 - 8, 8, bold, hex("#7c2d12"));
    text(corta(estimadas.map((e) => `${e.marca} (${Math.round(e.kg)} kg)`).join(", "), font, 7, wBig - 16), M + 8, ly2 - 19, 7, font, hex("#7c2d12")); }
  // ajustes por marca aplicados nesta carga (lib/carga/ajustes.js) — a Expedição precisa saber o que foi decidido à mão
  const marcasDaCarga = new Set(itens.flatMap((u) => (u.membros || []).map((m) => m.marca)));
  const aplicados = Object.entries(ajustes || {}).filter(([m]) => marcasDaCarga.has(m));
  if (aplicados.length) { const ya = ly - (estimadas.length ? 78 : 44); text(`Ajustes por marca: ${corta(aplicados.map(([m, r]) => `${m} — ${resumoDaRegra(r)}`).join(" · "), font, 7, wBig - 90)}`, M, ya - 8, 7, font, hex("#0b4a75")); }
  kmad.forEach(([v, l1, l2], i) => { const x = M + i * (wBig / 4 + 2), w = wBig / 4 - 4, vw = wid(v, bold, 14); page.drawRectangle({ x, y: ly - 26, width: w, height: 32, color: NAVY }); text(v, x + 7, ly - 14, 14, bold, WHITE); text(corta(l1, font, 6.5, w - vw - 14), x + vw + 12, ly - 8, 6.5, font, WHITE); text(corta(l2, font, 6, w - vw - 14), x + vw + 12, ly - 17, 6, font, WHITE); });

  // ── separar as peças, por fase ──
  novaPagina("1 · Separar as peças — por fase (a letra da marca). Vol. = volume em que a marca vai");
  const porFase = new Map();
  for (const u of itens) for (const m of u.membros || []) { const f = faseDaMarca(m.marca, prefixo); const g = porFase.get(f) || new Map(); const x = g.get(m.marca) || { n: 0, desc: m.desc, kg: 0, vols: new Map() }; x.n++; x.kg += m.kg || 0; x.vols.set(u.volume, (x.vols.get(u.volume) || 0) + 1); g.set(m.marca, x); porFase.set(f, g); }
  const COLS = 3, cw = (W - 16) / COLS, LH = 11; let col = 0, yCol = y, yTopo = y;
  const linhaSep = (f) => { if (yCol < 40) { col++; yCol = yTopo; if (col >= COLS) { novaPagina("1 · Separar as peças (continuação)"); col = 0; yTopo = y; yCol = y; } } return f(M + col * (cw + 8), yCol); };
  for (const [f, g] of [...porFase].sort((a, b) => a[0].localeCompare(b[0]))) {
    const linhas = [...g].sort((a, b) => a[0].localeCompare(b[0], "pt", { numeric: true }));
    linhaSep((x, yy) => { page.drawRectangle({ x, y: yy - 4, width: cw, height: 15, color: NAVY }); text(`Fase ${f}`, x + 5, yy, 9, bold, WHITE); const s = `${linhas.length} marcas · ${linhas.reduce((t, [, v]) => t + v.n, 0)} pç · ${kg(linhas.reduce((t, [, v]) => t + v.kg, 0))} kg`; text(s, x + cw - 5 - wid(s, font, 7), yy, 7, font, WHITE); yCol -= 17; });
    for (const [m, x] of linhas) linhaSep((px, yy) => {
      text(m, px + 2, yy, 8, bold); text(corta(x.desc || "", font, 7, cw - 118), px + 52, yy, 7, font, GRAY); text(String(x.n), px + cw - 62 - wid(String(x.n), bold, 8), yy, 8, bold);
      let vx = px + cw - 56; for (const [v, n] of [...x.vols].sort((a, b) => a[0] - b[0])) { const u = itens.find((i) => i.volume === v); vx += chip(vx, yy, x.vols.size > 1 ? `${v}x${n}` : v, COR[TIPO(u)], 7) + 2; }
      page.drawLine({ start: { x: px, y: yy - 4 }, end: { x: px + cw, y: yy - 4 }, thickness: 0.3, color: LINE }); yCol -= LH; });
    yCol -= 5;
  }

  // ── formar os volumes ──
  novaPagina("2 · Formar os volumes");
  const ordem = [...itens].sort((a, b) => a.volume - b.volume), cardW = (W - 3 * 8) / 4, cardH = 78; let cx = 0;
  for (const u of ordem) {
    if (y - cardH < 30) { novaPagina("2 · Formar os volumes (continuação)"); cx = 0; }
    const t = TIPO(u), x = M + cx * (cardW + 8), rom = (carga.romaneio || []).find((r) => r.id === u.id) || {};
    page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, borderColor: LINE, borderWidth: 0.5, color: WHITE }); page.drawRectangle({ x, y: y - 3, width: cardW, height: 3, color: COR[t] });
    const cwid = chip(x + 6, y - 17, u.volume, COR[t], 10); text(ROT[t], x + 10 + cwid, y - 16, 9, bold);
    const cont = new Map(); for (const m of u.membros || []) cont.set(m.marca, (cont.get(m.marca) || 0) + 1);
    const contS = [...cont].map(([k, n]) => `${k}${n > 1 ? ` x${n}` : ""}`).join(", ");
    let yy = y - 30; for (const ln of quebra(contS, font, 7.5, cardW - 12, 2)) { text(ln, x + 6, yy, 7.5); yy -= 9; }
    text(`${(u.membros || []).length} pç · ${kg(u.kg)} kg · ${cm(u.C)} x ${cm(u.L)} x ${cm(u.A)} cm`, x + 6, y - 52, 7.5, bold);
    const md = rom.madeira || {}; text(`${md.nCaibro || 2} caibros de ${String(md.compCaibro || 0).replace(".", ",")} m${md.sarrafo ? ` · ${md.sarrafo} sarrafo` : ""}${md.tabua ? ` · ${md.tabua} tábua` : ""}${t === "feixe" ? " · fita a 50 cm das pontas e a cada 1,5 m" : ""}`, x + 6, y - 64, 6.5, font, hex("#6b4a1e"));
    cx++; if (cx === 4) { cx = 0; y -= cardH + 8; }
  }

  // ── montar a carga, camada por camada ──
  const camadas = [...new Set((carga.passos || []).map((id) => byId.get(id)?.camada || 0))].sort((a, b) => a - b);
  for (const ci of camadas) {
    const its = (carga.passos || []).map((id) => byId.get(id)).filter((u) => u && (u.camada || 0) === ci), im = (imagens.camadas || []).find((c) => c.ci === ci) || {};
    novaPagina(`3 · Montar a carga — camada ${ci + 1} de ${camadas.length}${ci === 0 ? " · direto sobre os caibros do assoalho" : ` · sobre a camada ${ci}`}`);
    const s = `${its.length} volumes · ${kg(its.reduce((t, u) => t + u.kg, 0))} kg · topo a ${m1(Math.max(...its.map((u) => u.y + u.A)))} m`; text(s, M, y, 9, font, GRAY); y -= 10;
    const hI = 250, wI = W * 0.6; await imagem(im.iso, M, y - hI, wI, hI); await imagem(im.topo, M + wI + 8, y - hI * 0.62, W - wI - 8, hI * 0.62);
    text("colorido = esta camada · cinza = já carregado", M, y - hI - 10, 7, font, GRAY); text("vista de cima — frente à esquerda", M + wI + 8, y - hI * 0.62 - 10, 7, font, GRAY);
    y -= hI + 22;
    const dica = ci === 0 ? "Caibros atravessados a cada 1,5 m antes de descer o primeiro volume. Pesado e rígido embaixo." : `Caibro ou sarrafo entre as camadas, alinhado com o de baixo. Cinta catraca fechando a camada ${ci} antes de subir esta.`;
    page.drawRectangle({ x: M, y: y - 16, width: W, height: 22, color: hex("#FFF7ED"), borderColor: ORANGE, borderWidth: 0.6 }); text(dica, M + 8, y - 8, 8, font, hex("#7c2d12")); y -= 26;
    const lado = (u) => { const z = u.z + (u.fz || u.L) / 2, t = veic.L / 3; return z < t ? "esquerda" : z > 2 * t ? "direita" : "centro"; };
    const colW = W / 2; let k = 0;
    for (const u of its) { const x = M + (k % 2) * colW, yy = y - Math.floor(k / 2) * 14; if (yy < 30) break;
      text(`${k + 1}º`, x, yy, 7, font, GRAY); const w = chip(x + 16, yy, u.volume, COR[TIPO(u)], 8);
      text(`${ROT[TIPO(u)]} · ${m1(u.x)} a ${m1(u.x + (u.fx || u.C))} m da frente · ${lado(u)}${u.girada ? " · atravessado" : ""}${u.y > 0 && u.sobre?.length ? ` · sobre ${u.sobre.map((id) => byId.get(id)?.volume).filter(Boolean).join(", ")}` : ""}`, x + 20 + w, yy, 8); k++; }
  }
  const bytes = await pdf.save();
  return { bytes, filename: `Modelo de carga - OP ${op.numero} - romaneio previo ${String(previo.numero).padStart(2, "0")}${total > 1 ? ` - carga ${indice + 1}` : ""}.pdf` };
}

function quebra(str, f, size, maxW, maxLinhas) {
  const out = []; let l = "";
  for (const w of san(str).split(" ")) { const t = l ? `${l} ${w}` : w; if (f.widthOfTextAtSize(t, size) <= maxW) l = t; else { out.push(l); l = w; if (out.length === maxLinhas) break; } }
  if (out.length < maxLinhas && l) out.push(l);
  if (out.length === maxLinhas && f.widthOfTextAtSize(out[maxLinhas - 1], size) > maxW - 8) out[maxLinhas - 1] = out[maxLinhas - 1].replace(/.{3}$/, "…");
  return out;
}
