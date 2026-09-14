// PDF do MODELO DE CARGA para a Expedição: a carga pronta (fotos do 3D), separar as peças por fase,
// formar os volumes e montar camada por camada. A4 paisagem, padrão Torg (faixa navy + filete laranja).
// Veio do protótipo gerar-modelo-carga.mjs (set/2026) que o Vitor aprovou: "faça um modelo para 1 carga
// apenas e precisa ser mais visual" → fotos do 3D por camada; "por fase, não frente" → lista por fase.
//
// As imagens vêm do navegador (o 3D é desenhado lá): { full: { iso, lado, topo }, camadas: [{ ci, iso, topo }], volumes: { [id]: iso } }, JPEG em data URL.
//
// Estrutura (Vitor, 14/09/2026 — "o pdf está bem ruim, mal formatado, e o ideal seria um desenho do modelo
// das embalagens para usarmos como referência para montagem"):
//   1 · a carga pronta (fotos do 3D, números, madeira)          2 · modelos de embalagem (desenho + regras, por tipo)
//   3 · volumes (um cartão por volume, com a FOTO 3D DO VOLUME SOZINHO, peças, madeira, cintas e posição)
//   4 · montar a carga, 4 camadas por folha                      Anexo · separação das peças por fase
//
// ⚠⚠ RODA NO NAVEGADOR (e também no servidor). Vitor (14/09/2026): "não estou conseguindo exportar o
// pdf". A primeira versão mandava as fotos para uma rota da Vercel montar o A4 — e uma carga com várias
// camadas são 3 + 2×camadas JPEGs de 1200×560, que passam fácil dos 4,5 MB que a função aceita no corpo
// (o mesmo teto do upload de anexos, ver torg_upload_4mb). O PDF agora é montado onde as fotos já estão:
// no navegador, com o pdf-lib, sem subir nada. Por isso este arquivo NÃO importa fs/path/server-only —
// o logo entra por parâmetro (`logo`: bytes do PNG; a rota lê do disco, o navegador baixa /torg-logo-white.png).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { faseDaMarca } from "./classificar";
import { resumoDaRegra } from "./ajustes";
import { desenharModeloEmbalagem } from "./modelo-embalagem-desenho";

const PW = 841.89, PH = 595.28, M = 28, W = PW - 2 * M;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255), ORANGE = rgb(244 / 255, 128 / 255, 31 / 255), DARK = rgb(0.16, 0.2, 0.27), GRAY = rgb(0.34, 0.43, 0.49), LINE = rgb(0.82, 0.86, 0.9), HEADBG = rgb(0.93, 0.95, 0.97), WHITE = rgb(1, 1, 1);
const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").split("").map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TIPO = (u) => u.tipo === "CAIXA" ? "caixa" : u.embalagem?.tipo === "engradado" ? "engradado" : u.gc ? "gc" : u.grade ? (u.degrau ? "degrau" : "grade") : u.tipo === "PACOTE" ? "feixe" : "solta";
const ROT = { caixa: "Caixa de madeira", engradado: "Engradado", gc: "Pacote de guarda-corpo", grade: "Pacote de grade de piso", degrau: "Pacote de degraus", feixe: "Feixe cintado", solta: "Peça solta" };
const COR = { caixa: hex("#c8a165"), engradado: hex("#a8763e"), gc: hex("#4caf7d"), grade: hex("#2aa198"), degrau: hex("#7c9a3a"), feixe: hex("#3b82c4"), solta: hex("#8a94a6") };
const kg = (v) => Math.round(v || 0).toLocaleString("pt-BR"), m1 = (v) => (v / 1000).toFixed(1).replace(".", ","), cm = (v) => Math.round(v / 10);

/**
 * @param {object} p  { op, previo, carga (uma carga da simulação), indice, total, perfilNome, imagens, estimadas, ajustes, logo (bytes do PNG) }
 * @returns {Promise<{bytes: Uint8Array, filename: string}>}
 */
export async function gerarModeloCargaPDF({ op, previo, carga, indice = 0, total = 1, perfilNome = "", prefixo = "", imagens = {}, estimadas = [], ajustes = {}, logo: logoBytes = null }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null; if (logoBytes) { try { logo = await pdf.embedPng(logoBytes); } catch { logo = null; } }
  // o pdf-lib aceita a data URL direto (decodifica o base64 sem Buffer — funciona no navegador)
  const jpg = async (d) => { if (!d || !/^data:image\/jpeg;base64,/.test(String(d))) return null; try { return await pdf.embedJpg(d); } catch { return null; } };
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
  // legenda só na largura da foto grande: com 6 tipos ela passava da coluna e invadia a vista de cima
  let ly = y - hBig - 28, lx = M; for (const k of Object.keys(ROT).filter((k) => itens.some((u) => TIPO(u) === k))) { const wl = wid(ROT[k], font, 8) + 24; if (lx > M && lx + wl > M + wBig) { lx = M; ly -= 13; } page.drawRectangle({ x: lx, y: ly - 2, width: 9, height: 9, color: COR[k] }); text(ROT[k], lx + 12, ly, 8); lx += wl; }
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

  // ── 2 · modelos de embalagem: o PADRÃO de cada tipo que esta carga usa (desenho + regras) ──
  // Vitor (14/09/2026): "o ideal seria um desenho do modelo das embalagens para usarmos como referência
  // para montagem". O desenho é esquemático e igual para toda obra; o volume real está no cartão (3D).
  const tipos = Object.keys(ROT).filter((k) => itens.some((u) => TIPO(u) === k)).map((k) => (k === "degrau" ? "grade" : k)).filter((k, i, a) => a.indexOf(k) === i);
  if (tipos.length) {
    novaPagina("2 · Modelos de embalagem — como montar cada tipo de volume desta carga");
    const cols = tipos.length <= 2 ? tipos.length : tipos.length <= 4 ? 2 : 3, rows = Math.ceil(tipos.length / cols), pw = (W - (cols - 1) * 10) / cols, ph = Math.min(230, (y - 30 - (rows - 1) * 10) / rows);
    tipos.forEach((t, i) => { const c = i % cols, r = Math.floor(i / cols); desenharModeloEmbalagem(page, t, { x: M + c * (pw + 10), y: y - ph - r * (ph + 10), w: pw, h: ph }, { font, bold, titulo: t === "grade" ? "Pacote de grade de piso / degraus" : ROT[t], cor: COR[t] }); });
  }

  // ── 3 · volumes: um cartão por volume, com a foto 3D do volume sozinho (a referência de montagem) ──
  const ordem = [...itens].sort((a, b) => a.volume - b.volume), COLS_V = 3, cardW = (W - (COLS_V - 1) * 10) / COLS_V, cardH = 200, imgH = 112;
  const lado = (u) => { const z = u.z + (u.fz || u.L) / 2, t = veic.L / 3; return z < t ? "esquerda" : z > 2 * t ? "direita" : "centro"; };
  const cintas = (u, t) => t === "caixa" ? "tampa pregada" : t === "solta" ? `cinta catraca em cada apoio` : `${2 + Math.max(0, Math.floor((u.C / 1000 - 1) / 1.5))} cintas PET`;
  novaPagina("3 · Volumes — como formar cada um (foto do volume, peças, madeira e onde ele vai na carga)");
  let k = 0;
  for (const u of ordem) {
    const r = Math.floor(k / COLS_V); let top = y - r * (cardH + 10);
    if (top - cardH < 24) { novaPagina("3 · Volumes (continuação)"); k = 0; top = y; }
    const t = TIPO(u), x = M + (k % COLS_V) * (cardW + 10), rom = (carga.romaneio || []).find((rr) => rr.id === u.id) || {};
    page.drawRectangle({ x, y: top - cardH, width: cardW, height: cardH, borderColor: LINE, borderWidth: 0.5, color: WHITE }); page.drawRectangle({ x, y: top - 3, width: cardW, height: 3, color: COR[t] });
    const cw = chip(x + 6, top - 17, u.volume, COR[t], 10); text(ROT[t], x + 10 + cw, top - 16, 9, bold);
    const dims = `${cm(u.C)} × ${cm(u.L)} × ${cm(u.A)} cm · ${kg(u.kg)} kg`; text(dims, x + cardW - 6 - wid(dims, font, 7.5), top - 16, 7.5, font, GRAY);
    await imagem(imagens.volumes?.[u.id], x + 6, top - 24 - imgH, cardW - 12, imgH);
    const cont = new Map(); for (const m of u.membros || []) cont.set(m.marca, (cont.get(m.marca) || 0) + 1);
    const contS = `${(u.membros || []).length} pç: ` + [...cont].map(([kk, n]) => `${kk}${n > 1 ? ` ×${n}` : ""}`).join(", ");
    let yy = top - 24 - imgH - 12; for (const ln of quebra(contS, font, 7, cardW - 12, 3)) { text(ln, x + 6, yy, 7); yy -= 9; }
    const md = rom.madeira || {}; const mad = [`${md.nCaibro || 2} caibros de ${String(md.compCaibro || 0).replace(".", ",")} m`, md.sarrafo ? `${md.sarrafo} sarrafo${md.sarrafo > 1 ? "s" : ""}` : null, md.tabua ? `${md.tabua} tábua${md.tabua > 1 ? "s" : ""}` : null, cintas(u, t)].filter(Boolean).join(" · ");
    yy = top - cardH + 30; text(corta(mad, font, 7, cardW - 12), x + 6, yy, 7, font, hex("#0b4a75"));
    // onde o volume vai na carga, em duas linhas curtas (numa só, "atravessado · no assoalho" não cabia)
    text(corta(`Na carga: ${m1(u.x)} a ${m1(u.x + (u.fx || u.C))} m da frente · ${lado(u)} · camada ${(u.camada || 0) + 1}`, bold, 7, cardW - 12), x + 6, top - cardH + 19, 7, bold, DARK);
    text(corta(`${u.y > 0 && u.sobre?.length ? `sobre os volumes ${u.sobre.map((id) => byId.get(id)?.volume).filter(Boolean).join(", ")}` : "direto no assoalho (sobre caibros)"}${u.girada ? " · atravessado na carroceria" : ""}`, font, 7, cardW - 12), x + 6, top - cardH + 9, 7, font, DARK);
    k++;
  }

  // ── 4 · montar a carga, camada por camada — 4 camadas por folha ──
  const camadas = [...new Set((carga.passos || []).map((id) => byId.get(id)?.camada || 0))].sort((a, b) => a - b);
  const cellW = (W - 10) / 2, cellImgH = Math.round(cellW / (1200 / 560)), cellH = cellImgH + 34; // a foto tem 1200×560
  for (const [i, ci] of camadas.entries()) {
    if (i % 4 === 0) { novaPagina(`4 · Montar a carga — camada por camada (${camadas.length} camadas)`); text("Caibros atravessados a cada 1,5 m antes do primeiro volume; caibro ou sarrafo entre as camadas, alinhado com o de baixo; cinta catraca fecha a camada antes de subir a próxima. Colorido = esta camada · cinza = já carregado.", M, y, 7.5, font, hex("#7c2d12")); y -= 14; }
    const its = (carga.passos || []).map((id) => byId.get(id)).filter((u) => u && (u.camada || 0) === ci), im = (imagens.camadas || []).find((cc) => cc.ci === ci) || {};
    const c = i % 2, r = Math.floor((i % 4) / 2), x = M + c * (cellW + 10), top = y - r * (cellH + 8);
    await imagem(im.iso, x, top - cellImgH, cellW, cellImgH);
    const tit = `Camada ${ci + 1}${ci === 0 ? " · direto sobre os caibros do assoalho" : ` · sobre a camada ${ci}`} · ${its.length} volume${its.length > 1 ? "s" : ""} · ${kg(its.reduce((tt, u) => tt + u.kg, 0))} kg · topo a ${m1(Math.max(...its.map((u) => u.y + u.A)))} m`;
    text(corta(tit, bold, 8, cellW), x, top - cellImgH - 11, 8, bold, NAVY);
    // ⚠ "→" não existe no WinAnsi (saía "?"); e a lista vai em ordem de número, não na sequência interna do motor
    const seq = [...its].sort((a, b) => a.volume - b.volume).map((u) => `${u.volume} (${ROT[TIPO(u)].toLowerCase().replace("pacote de ", "")}${u.y > 0 && u.sobre?.length ? ` sobre ${u.sobre.map((id) => byId.get(id)?.volume).filter(Boolean).join(",")}` : ""})`).join(" · ");
    const lns = quebra(`Volumes: ${seq}`, font, 7, cellW, 2); lns.forEach((ln, j) => text(ln, x, top - cellImgH - 21 - j * 8, 7, font, DARK));
  }

  // ── anexo · separar as peças, por fase (a lista de conferência de quem separa no pátio) ──
  novaPagina("Anexo · Separação das peças por fase — Vol. = volume em que a marca vai");
  const porFase = new Map();
  for (const u of itens) for (const m of u.membros || []) { const f = faseDaMarca(m.marca, prefixo); const g = porFase.get(f) || new Map(); const x = g.get(m.marca) || { n: 0, desc: m.desc, kg: 0, vols: new Map() }; x.n++; x.kg += m.kg || 0; x.vols.set(u.volume, (x.vols.get(u.volume) || 0) + 1); g.set(m.marca, x); porFase.set(f, g); }
  const COLS = 4, cw = (W - 3 * 8) / COLS, LH = 10.5; let col = 0, yCol = y, yTopo = y;
  const linhaSep = (f) => { if (yCol < 40) { col++; yCol = yTopo; if (col >= COLS) { novaPagina("Anexo · Separação das peças por fase (continuação)"); col = 0; yTopo = y; yCol = y; } } return f(M + col * (cw + 8), yCol); };
  for (const [f, g] of [...porFase].sort((a, b) => (a[0] === "?" ? 1 : b[0] === "?" ? -1 : a[0].localeCompare(b[0])))) {
    const linhas = [...g].sort((a, b) => a[0].localeCompare(b[0], "pt", { numeric: true }));
    linhaSep((x, yy) => { page.drawRectangle({ x, y: yy - 4, width: cw, height: 15, color: NAVY }); text(f === "?" ? "Sem fase (marca do cliente)" : `Fase ${f}`, x + 5, yy, 8.5, bold, WHITE); const st = `${linhas.length} marcas · ${linhas.reduce((tt, [, v]) => tt + v.n, 0)} pç · ${kg(linhas.reduce((tt, [, v]) => tt + v.kg, 0))} kg`; text(st, x + cw - 5 - wid(st, font, 6.5), yy, 6.5, font, WHITE); yCol -= LH + 6; });
    for (const [m, x] of linhas) linhaSep((px, yy) => {
      text(m, px + 2, yy, 7.5, bold); text(corta(x.desc || "", font, 6.5, cw - 110), px + 50, yy, 6.5, font, GRAY); text(String(x.n), px + cw - 58 - wid(String(x.n), bold, 7.5), yy, 7.5, bold);
      let vx = px + cw - 52; for (const [v, n] of [...x.vols].sort((a, b) => a[0] - b[0])) { const u = itens.find((i) => i.volume === v); vx += chip(vx, yy, x.vols.size > 1 ? `${v}x${n}` : v, COR[TIPO(u)], 6.5) + 2; }
      page.drawLine({ start: { x: px, y: yy - 4 }, end: { x: px + cw, y: yy - 4 }, thickness: 0.3, color: LINE }); yCol -= LH; });
    yCol -= 5;
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
