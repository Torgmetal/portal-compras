import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// PDF do ORGANOGRAMA (RH) — mesma linguagem dos outros PDFs Torg (faixa navy + filete
// laranja + logo). Empresa → setores (barra de cor + sigla + gestor) → pessoas (2 colunas).

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const BLUE = rgb(0, 110 / 255, 171 / 255);
const DARK = rgb(0, 38 / 255, 63 / 255);
const GRAY = rgb(0.36, 0.45, 0.52);
const LINE = rgb(0.886, 0.914, 0.941);
const SOFT = rgb(0.961, 0.973, 0.984);
const WHITE = rgb(1, 1, 1);

const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return BLUE;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export async function gerarOrganogramaPDF({ empresa = "Torg Metal", totalSetores = 0, totalFuncionarios = 0, setores = [] }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }

  const W = A4[0] - 2 * M;
  let page, y;
  const paginas = [];

  const novaPagina = (comBanda) => {
    page = pdf.addPage(A4);
    paginas.push(page);
    if (comBanda) {
      const h = 96;
      page.drawRectangle({ x: 0, y: A4[1] - h, width: A4[0], height: h, color: NAVY });
      page.drawRectangle({ x: 0, y: A4[1] - h - 4, width: A4[0], height: 4, color: ORANGE });
      if (logo) { const lw = 92, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - h + (h - lh) / 2, width: lw, height: lh }); }
      const x0 = M + (logo ? 118 : 0);
      page.drawText("ORGANOGRAMA", { x: x0, y: A4[1] - 44, size: 16, font: bold, color: WHITE });
      page.drawText(san(empresa), { x: x0, y: A4[1] - 64, size: 10, font, color: rgb(0.8, 0.86, 0.94) });
      page.drawText(san(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`), { x: x0, y: A4[1] - 80, size: 8.5, font, color: rgb(0.66, 0.76, 0.88) });
      y = A4[1] - h - 24;
    } else { y = A4[1] - M; }
  };
  const espaco = (n) => { if (y - n < 64) novaPagina(false); };
  const trunc = (t, larg, tam) => { let s = san(t); while (font.widthOfTextAtSize(s, tam) > larg && s.length > 4) s = s.slice(0, -2); return s.length < san(t).length ? s + "..." : s; };

  novaPagina(true);
  // resumo
  page.drawText(san(`${totalSetores} ${totalSetores === 1 ? "setor" : "setores"} - ${totalFuncionarios} colaboradores ativos`), { x: M, y, size: 10.5, font: bold, color: GRAY });
  y -= 22;

  for (const s of setores) {
    const membros = s.funcionarios || [];
    espaco(58); // mantém o cabeçalho do setor com o começo do conteúdo
    // faixa do setor (barra de cor + nome + sigla + contagem)
    page.drawRectangle({ x: M, y: y - 24, width: W, height: 24, color: SOFT, borderColor: LINE, borderWidth: 0.8 });
    page.drawRectangle({ x: M, y: y - 24, width: 4.5, height: 24, color: hexRgb(s.cor) });
    const nome = san(s.nome);
    page.drawText(nome, { x: M + 14, y: y - 16, size: 11.5, font: bold, color: DARK });
    if (s.sigla) page.drawText(san(s.sigla), { x: M + 14 + bold.widthOfTextAtSize(nome, 11.5) + 8, y: y - 15, size: 8, font, color: GRAY });
    const cont = `${membros.length} ${membros.length === 1 ? "pessoa" : "pessoas"}`;
    page.drawText(cont, { x: M + W - font.widthOfTextAtSize(cont, 9) - 12, y: y - 16, size: 9, font, color: GRAY });
    y -= 32;
    // gestor
    if (s.gestor) {
      page.drawText(san(`Gestor: ${s.gestor.nome}${s.gestor.cargo ? ` - ${s.gestor.cargo.nome}` : ""}`), { x: M + 14, y, size: 9.5, font: bold, color: BLUE });
      y -= 16;
    }
    // pessoas em 2 colunas (quebra de página por linha)
    if (!membros.length) {
      page.drawText("Sem colaboradores neste setor.", { x: M + 14, y, size: 9, font, color: GRAY });
      y -= 14;
    } else {
      const colW = (W - 28) / 2;
      for (let row = 0; row * 2 < membros.length; row++) {
        espaco(16);
        for (let col = 0; col < 2; col++) {
          const f = membros[row * 2 + col];
          if (!f) continue;
          const txt = `- ${f.nome}${f.cargo ? `  (${f.cargo.nome})` : ""}`;
          page.drawText(trunc(txt, colW - 6, 9), { x: M + 14 + col * colW, y, size: 9, font, color: DARK });
        }
        y -= 13.5;
      }
    }
    y -= 12;
  }

  // rodapé paginado
  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 42 }, end: { x: M + W, y: 42 }, thickness: 0.6, color: LINE });
    p.drawText(san(`${empresa} - RH - Organograma`), { x: M, y: 30, size: 8, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: M + W - font.widthOfTextAtSize(pg, 8), y: 30, size: 8, font, color: GRAY });
  });

  return pdf.save();
}
