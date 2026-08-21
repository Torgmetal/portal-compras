import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dataBR } from "./data-br";
import { recortarVista } from "./vista-desenho";

// RELATÓRIO DE INSPEÇÃO DIMENSIONAL E VISUAL — no formato do formulário da Torg.
//
// Vitor (21/08/2026): "quando gerar o relatório ele precisa ficar com a cara de relatório do
// excel". O layout aqui reproduz o modelo dele, campo a campo:
//
//   título + DATA / Nº / FOLHA
//   FABRICANTE · CLIENTE · OBRA · IDENTIFICAÇÃO DA PEÇA
//   Nº DESENHO · DESCRIÇÃO · QUANT.
//   [ Dimensão de Projeto | Tolerâncias | Dimensão Encontrada ]  [ CROQUI / FOTO DA PEÇA ]
//   DIMENSIONAL / ALINHAMENTO / ACABAMENTO  ·  RESULTADO
//   COMENTÁRIOS
//   *Tolerâncias conforme …   *Equipamentos utilizados: …
//   Inspetor Torg Metal · Fiscalização Torg Metal · Inspetor Cliente
//
// ⚠ O DESENHO FICA AO LADO DA TABELA, não numa página de anexo. É o campo "CROQUI / FOTO DA PEÇA"
// do formulário — Vitor: "seria para trazer como se fosse um print do conjunto com as informações
// das cotas do projeto". Entra como página embutida (vetor), então as cotas ficam legíveis.
//
// ⚠ A caixa da dimensão encontrada sai VAZIA quando ninguém mediu. Vitor: "as dimensões
// encontradas você deve deixar para o elaborador do relatório preencher" — e um "—" ali diria que
// mediram e não acharam nada.

const A4 = [595.28, 841.89];
const M = 28;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0, 38 / 255, 63 / 255);
const GRAY = rgb(0.36, 0.45, 0.52);
const LINE = rgb(0.72, 0.76, 0.80);
const SOFT = rgb(0.957, 0.969, 0.980);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.02, 0.47, 0.34);
const RED = rgb(0.78, 0.12, 0.12);

const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const nz = (v) => (v == null || v === "" ? "" : String(v));

export async function gerarDimensionalPDF({ rel, assinaturas = null, desenhoBytes = null, cliente = null, obra = null }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo.png"))); } catch { /* sem logo */ }

  const W = A4[0] - 2 * M;
  const linhas = Array.isArray(rel.linhas) ? rel.linhas : [];
  const desenhos = Array.isArray(rel.desenhos) ? rel.desenhos : [];
  const res = rel.resultados || {};

  const fit = (t, f, tam, larg) => {
    let s = san(t);
    if (f.widthOfTextAtSize(s, tam) <= larg) return s;
    while (s.length > 1 && f.widthOfTextAtSize(`${s}...`, tam) > larg) s = s.slice(0, -1);
    return `${s}...`;
  };
  const quebrar = (t, f, tam, larg) => {
    const out = [];
    for (const par of san(t).split(/\n+/)) {
      let l = "";
      for (const p of par.split(/\s+/)) {
        const c = l ? `${l} ${p}` : p;
        if (f.widthOfTextAtSize(c, tam) <= larg) l = c;
        else { if (l) out.push(l); l = p; }
      }
      if (l) out.push(l);
    }
    return out;
  };

  // ── quantas páginas? uma por desenho (o formulário é "FOLHA n DE N") ──────────────────────
  // O modelo é por peça: cada desenho ganha a sua folha, com as dimensões daquela peça.
  const grupos = desenhos.length
    ? desenhos.map((d) => ({
        desenho: d,
        // linha de conjunto tem `conjunto` apontando pro pai; avulsa tem marca própria
        linhas: linhas.filter((l) => (l.conjunto || l.marca) === d.marca) || [],
      }))
    : [{ desenho: null, linhas }];
  // linha que não casou com desenho nenhum não pode sumir do documento
  const orfas = linhas.filter((l) => !grupos.some((g) => g.linhas.includes(l)));
  if (orfas.length) grupos[grupos.length - 1].linhas = [...grupos[grupos.length - 1].linhas, ...orfas];

  const total = grupos.length;

  for (let gi = 0; gi < total; gi++) {
    const g = grupos[gi];
    const page = pdf.addPage(A4);
    const marca = g.desenho?.marca || (Array.isArray(rel.marcas) ? rel.marcas.join(", ") : "");
    let y = A4[1] - M;

    const caixa = (x, yTopo, larg, alt, fundo = null) => {
      if (fundo) page.drawRectangle({ x, y: yTopo - alt, width: larg, height: alt, color: fundo });
      page.drawRectangle({ x, y: yTopo - alt, width: larg, height: alt, borderColor: LINE, borderWidth: 0.7 });
    };
    const rotulo = (x, yy, t) => page.drawText(san(t), { x, y: yy, size: 6.2, font: bold, color: GRAY });
    const valor = (x, yy, t, larg, tam = 8.5) => page.drawText(fit(t, bold, tam, larg), { x, y: yy, size: tam, font: bold, color: DARK });

    // ── cabeçalho ──
    const hCab = 46;
    caixa(M, y, W, hCab);
    if (logo) { const lw = 62, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M + 8, y: y - hCab / 2 - lh / 2, width: lw, height: lh }); }
    page.drawText("RELATÓRIO DE INSPEÇÃO DIMENSIONAL E VISUAL", { x: M + 82, y: y - 20, size: 11, font: bold, color: NAVY });
    page.drawText("Torg Metal · Sistema de Gestão da Qualidade · ISO 9001", { x: M + 82, y: y - 33, size: 7, font, color: GRAY });

    // bloco DATA / Nº / FOLHA, à direita
    const xDir = M + W - 130;
    page.drawLine({ start: { x: xDir, y }, end: { x: xDir, y: y - hCab }, thickness: 0.7, color: LINE });
    const infos = [["DATA:", dataBR(rel.emitidoEm || new Date())], ["Nº:", rel.codigo], ["FOLHA:", `${gi + 1} DE ${total}`]];
    infos.forEach(([r, v], i) => {
      const yy = y - 13 - i * 13;
      page.drawText(r, { x: xDir + 7, y: yy, size: 6.8, font: bold, color: GRAY });
      page.drawText(fit(v, bold, 8, 78), { x: xDir + 45, y: yy, size: 8, font: bold, color: DARK });
    });
    y -= hCab;

    // ── identificação ──
    const linhaInfo = (campos, alt = 16) => {
      caixa(M, y, W, alt, SOFT);
      let x = M;
      campos.forEach(([r, v, frac], i) => {
        const larg = W * frac;
        if (i > 0) page.drawLine({ start: { x, y }, end: { x, y: y - alt }, thickness: 0.7, color: LINE });
        page.drawText(san(r), { x: x + 7, y: y - 11, size: 6.4, font: bold, color: GRAY });
        const dx = bold.widthOfTextAtSize(san(r), 6.4) + 12;
        valor(x + dx, y - 11, nz(v), larg - dx - 8, 8);
        x += larg;
      });
      y -= alt;
    };
    linhaInfo([["FABRICANTE:", "TORG METAL", 0.5], ["CLIENTE:", cliente || "", 0.5]]);
    linhaInfo([["OBRA:", `OP-${rel.opNumero}${obra ? ` — ${obra}` : ""}`, 1]]);
    const primeira = g.linhas[0] || {};
    linhaInfo([
      ["IDENTIFICAÇÃO DA PEÇA:", marca, 0.4],
      ["Nº DESENHO:", g.desenho?.nome?.replace(/\.pdf$/i, "") || marca, 0.35],
      ["QUANT.:", primeira.qtd != null ? String(primeira.qtd) : "", 0.25],
    ]);

    // ── corpo: tabela à esquerda, desenho à direita ──
    const hCorpo = 300;
    const wTab = W * 0.46;
    const wDes = W - wTab;
    const yCorpo = y;

    // cabeçalho das colunas
    const cabH = 18;
    caixa(M, yCorpo, wTab, cabH, SOFT);
    // ⚠ a coluna de projeto leva o texto INTEIRO ("Furos Ø18 na alma (2) — posição") e o valor;
    // com um terço da tabela ela cortava a descrição e a linha deixava de dizer o que medir.
    const cols = [
      { t: "Dimensão de Projeto", w: wTab * 0.52 },
      { t: "Tolerâncias", w: wTab * 0.18 },
      { t: "Dimensão Encontrada", w: wTab * 0.30 },
    ];
    let cx = M;
    cols.forEach((c, i) => {
      if (i > 0) page.drawLine({ start: { x: cx, y: yCorpo }, end: { x: cx, y: yCorpo - hCorpo }, thickness: 0.7, color: LINE });
      const t = fit(c.t, bold, 6.6, c.w - 6);
      page.drawText(t, { x: cx + (c.w - bold.widthOfTextAtSize(t, 6.6)) / 2, y: yCorpo - 12, size: 6.6, font: bold, color: GRAY });
      cx += c.w;
    });
    caixa(M, yCorpo, wTab, hCorpo);

    // linhas da tabela
    const rowH = 17;
    const maxLinhas = Math.floor((hCorpo - cabH) / rowH);
    let ly = yCorpo - cabH;
    for (let i = 0; i < maxLinhas; i++) {
      const l = g.linhas[i];
      page.drawLine({ start: { x: M, y: ly - rowH }, end: { x: M + wTab, y: ly - rowH }, thickness: 0.35, color: rgb(0.88, 0.90, 0.92) });
      if (l) {
        let x = M;
        // projeto: "W310X21 · 1034"
        // valor à direita da célula, descrição à esquerda: assim a descrição usa todo o espaço que
        // sobra e o número fica alinhado com os das outras linhas
        const val = l.projetoMm != null ? String(l.projetoMm) : "";
        const wVal = val ? bold.widthOfTextAtSize(val, 7.5) + 8 : 0;
        page.drawText(fit(l.descricao || l.marca || "", font, 7.5, cols[0].w - 10 - wVal), { x: x + 5, y: ly - 12, size: 7.5, font, color: DARK });
        if (val) page.drawText(val, { x: x + cols[0].w - 5 - bold.widthOfTextAtSize(val, 7.5), y: ly - 12, size: 7.5, font: bold, color: DARK });
        x += cols[0].w;
        const tol = l.tolerancia || "";
        page.drawText(fit(tol, font, 7.5, cols[1].w - 8), { x: x + 5, y: ly - 12, size: 7.5, font, color: GRAY });
        x += cols[1].w;
        // ⚠ vazio quando ninguém mediu
        if (l.encontradoMm != null) {
          const dif = l.projetoMm != null ? Number(l.encontradoMm) - Number(l.projetoMm) : null;
          page.drawText(String(l.encontradoMm), { x: x + 5, y: ly - 12, size: 7.5, font: bold, color: DARK });
          if (dif) {
            const t = `${dif > 0 ? "+" : ""}${Math.round(dif * 10) / 10}`;
            page.drawText(t, { x: x + cols[2].w - 8 - font.widthOfTextAtSize(t, 6.5), y: ly - 12, size: 6.5, font: bold, color: Math.abs(dif) > 3 ? RED : ORANGE });
          }
        }
      }
      ly -= rowH;
    }
    if (g.linhas.length > maxLinhas) {
      page.drawText(`+${g.linhas.length - maxLinhas} linha(s) — ver continuação`, { x: M + 5, y: yCorpo - hCorpo + 5, size: 6, font, color: ORANGE });
    }

    // campo do croqui / desenho
    caixa(M + wTab, yCorpo, wDes, hCorpo);
    page.drawRectangle({ x: M + wTab, y: yCorpo - cabH, width: wDes, height: cabH, color: SOFT });
    page.drawRectangle({ x: M + wTab, y: yCorpo - cabH, width: wDes, height: cabH, borderColor: LINE, borderWidth: 0.7 });
    const tCro = "CROQUI / FOTO DA PEÇA";
    page.drawText(tCro, { x: M + wTab + (wDes - bold.widthOfTextAtSize(tCro, 6.6)) / 2, y: yCorpo - 12, size: 6.6, font: bold, color: GRAY });

    if (g.desenho && typeof desenhoBytes === "function") {
      const bruto = await desenhoBytes(g.desenho);
      // ⚠ SÓ A VISTA. Vitor: "você está anexando o projeto todo, o que não precisa; precisamos
      // colocar apenas esse tipo de imagem". O recorte tira moldura, tabelas e carimbo; se falhar,
      // entra o desenho inteiro — melhor a folha cheia do que o campo em branco.
      let bytes = bruto;
      if (bruto) {
        const vista = await recortarVista(bruto).catch(() => null);
        if (vista?.bytes) bytes = vista.bytes;
      }
      if (bytes) {
        let emb = null;
        try { [emb] = await pdf.embedPdf(bytes, [0]); } catch { emb = null; }
        if (emb) {
          const dispW = wDes - 8, dispH = hCorpo - cabH - 8;
          const esc = Math.min(dispW / emb.width, dispH / emb.height);
          page.drawPage(emb, {
            x: M + wTab + 4 + (dispW - emb.width * esc) / 2,
            y: yCorpo - hCorpo + 4 + (dispH - emb.height * esc) / 2,
            width: emb.width * esc, height: emb.height * esc,
          });
        }
      }
    }
    y = yCorpo - hCorpo;

    // ── aprovações ──
    const marcar = (x, yy, ligado, cor) => {
      page.drawRectangle({ x, y: yy - 6.5, width: 7, height: 7, borderColor: ligado ? cor : LINE, borderWidth: ligado ? 1.1 : 0.7, color: ligado ? cor : undefined });
      if (ligado) {
        page.drawLine({ start: { x: x + 1.6, y: yy - 3 }, end: { x: x + 3, y: yy - 5 }, thickness: 1.1, color: WHITE });
        page.drawLine({ start: { x: x + 3, y: yy - 5 }, end: { x: x + 5.6, y: yy - 0.6 }, thickness: 1.1, color: WHITE });
      }
    };
    const hAp = 52;
    caixa(M, y, W, hAp);
    const wAp = W * 0.62;
    page.drawLine({ start: { x: M + wAp, y }, end: { x: M + wAp, y: y - hAp }, thickness: 0.7, color: LINE });
    [["DIMENSIONAL:", res.dimensional], ["ALINHAMENTO:", res.alinhamento], ["ACABAMENTO:", res.acabamento]].forEach(([rot, v], i) => {
      const yy = y - 15 - i * 14;
      page.drawText(rot, { x: M + 8, y: yy - 6, size: 7, font: bold, color: DARK });
      marcar(M + 92, yy, v === "APROVADO", GREEN);
      page.drawText("APROVADO", { x: M + 103, y: yy - 6, size: 7, font, color: DARK });
      marcar(M + 165, yy, v === "REPROVADO", RED);
      page.drawText("REPROVADO", { x: M + 176, y: yy - 6, size: 7, font, color: DARK });
    });
    page.drawText("RESULTADO:", { x: M + wAp + 8, y: y - 15, size: 7, font: bold, color: DARK });
    ["Retrabalhar", "Aprovado", "Reprovado"].forEach((op, i) => {
      const yy = y - 15 - i * 13;
      const on = String(res.resultado || "").toUpperCase() === op.toUpperCase();
      marcar(M + wAp + 74, yy, on, op === "Reprovado" ? RED : op === "Aprovado" ? GREEN : ORANGE);
      page.drawText(op, { x: M + wAp + 85, y: yy - 6, size: 7, font: on ? bold : font, color: DARK });
    });
    y -= hAp;

    // ── comentários ──
    const hCom = 44;
    caixa(M, y, W, hCom);
    rotulo(M + 7, y - 10, "COMENTÁRIOS:");
    let cyy = y - 21;
    for (const ln of quebrar(rel.observacoes || "", font, 7.5, W - 16).slice(0, 3)) {
      page.drawText(ln, { x: M + 7, y: cyy, size: 7.5, font, color: DARK });
      cyy -= 10;
    }
    y -= hCom;

    // ── notas: tolerância + instrumentos ──
    const instrumentos = Array.isArray(rel.equipamentos) ? rel.equipamentos : [];
    // ⚠ 30 pt de cabeçalho (as duas linhas de nota) + 9 por instrumento + 6 de folga. Com "20" a
    // lista transbordava a caixa e a última linha saía por cima do bloco de assinaturas.
    const hNotas = 30 + Math.max(1, instrumentos.length) * 9 + 6;
    caixa(M, y, W, hNotas);
    page.drawText(san(`*Tolerâncias conforme ${res.tolerancia || "PO-04 Tolerâncias de Fabricação"}`), { x: M + 7, y: y - 11, size: 6.6, font, color: GRAY });
    page.drawText("*Equipamentos utilizados:", { x: M + 7, y: y - 21, size: 6.6, font: bold, color: GRAY });
    let iyy = y - 30;
    if (instrumentos.length) {
      for (const e of instrumentos) {
        const txt = `${e.nome}: certificado de calibração nº ${e.certificado || "—"}${e.validade ? ` (validade ${String(e.validade).split("-").reverse().join("/")})` : ""}`;
        page.drawText(fit(txt, font, 6.6, W - 20), { x: M + 12, y: iyy, size: 6.6, font, color: e.vencido ? RED : DARK });
        if (e.vencido) page.drawText("VENCIDO", { x: M + W - 8 - bold.widthOfTextAtSize("VENCIDO", 6.6), y: iyy, size: 6.6, font: bold, color: RED });
        iyy -= 9;
      }
    } else {
      page.drawText("(nenhum instrumento informado)", { x: M + 12, y: iyy, size: 6.6, font, color: GRAY });
    }
    y -= hNotas;

    // ── assinaturas: os três papéis do formulário ──
    const hAss = 54;
    caixa(M, y, W, hAss);
    const papeis = ["Inspetor Torg Metal", "Fiscalização Torg Metal", "Inspetor Cliente"];
    const wA = W / 3;
    papeis.forEach((p, i) => {
      const x = M + i * wA;
      if (i > 0) page.drawLine({ start: { x, y }, end: { x, y: y - hAss }, thickness: 0.7, color: LINE });
      page.drawText(`${p}:`, { x: x + 8, y: y - 12, size: 6.8, font: bold, color: GRAY });
      // ⚠ casa pelo PAPEL INTEIRO, normalizado. Com a primeira palavra, "Inspetor Torg Metal" e
      // "Inspetor Cliente" casavam os dois com o mesmo assinante — e o documento saía dizendo que
      // o cliente assinou quando quem assinou foi a Torg.
      const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, " ").trim();
      const alvoP = norm(p);
      const a = (assinaturas || []).find((s) => {
        const st = norm(s.setor);
        return st === alvoP || (st && (alvoP.includes(st) || st.includes(alvoP)));
      });
      if (a?.assinadoEm) {
        page.drawText(fit(a.nome, bold, 8, wA - 18), { x: x + 8, y: y - 26, size: 8, font: bold, color: DARK });
        const d = new Date(a.assinadoEm);
        page.drawText(san(`assinado eletronicamente em ${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`), { x: x + 8, y: y - 36, size: 5.8, font, color: GREEN });
        if (a.ip) page.drawText(san(`IP ${a.ip}`), { x: x + 8, y: y - 44, size: 5.8, font, color: GRAY });
      } else {
        page.drawLine({ start: { x: x + 8, y: y - 34 }, end: { x: x + wA - 10, y: y - 34 }, thickness: 0.5, color: LINE });
        page.drawText("Controle de Qualidade", { x: x + 8, y: y - 44, size: 6.4, font, color: GRAY });
      }
    });
    y -= hAss;

    page.drawRectangle({ x: 0, y: 0, width: A4[0], height: 3, color: ORANGE });
    page.drawText(san(`${rel.codigo} · OP-${rel.opNumero} · folha ${gi + 1} de ${total}`), { x: M, y: 10, size: 6.2, font, color: GRAY });
    const av = "Registro eletrônico — confirmação, data/hora e IP registrados no portal.";
    page.drawText(av, { x: A4[0] - M - font.widthOfTextAtSize(av, 6.2), y: 10, size: 6.2, font, color: GRAY });
  }

  return pdf.save();
}
