import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dataBR } from "./data-br";

// ─── LISTA DE PRESENÇA PARA ASSINAR NO PAPEL ──────────────────────────────────
// Vitor (30/08/2026): "no caso dos funcionários da fábrica pegamos uma lista que vc já gera o
// modelo, já também, para coletarmos a assinatura e importa ela escaneada".
//
// São 70 funcionários ativos e 30 usuários do portal: ~40 pessoas da fábrica não têm login e nunca
// veriam o modal. Sem esta lista, a evidência da campanha cobriria menos da metade da empresa.
//
// ⚠ A LISTA É DE QUEM NÃO TEM ACESSO AO PORTAL, não de quem "ainda não viu". A regra tem de ser
// estável e explicável: quem tem login registra pelo modal, quem não tem registra no papel. Se a
// lista fosse "quem ainda não viu", às 7h da manhã ela traria também os do escritório que só iam
// abrir o portal às 8h — e o encarregado passaria papel para quem não precisa.
//
// ⚠ UMA LISTA SÓ, ordenada por setor (Vitor: "pode ser uma só"). O setor vira faixa de separação
// dentro da mesma lista: o encarregado acha a frente dele sem que a gente imprima sete papéis.

const A4 = [595.28, 841.89];
const M = 40;
const NAVY = rgb(0.051, 0.122, 0.235);
const ORANGE = rgb(0.957, 0.502, 0.122);
const GRAY = rgb(0.42, 0.47, 0.54);
const LINHA = rgb(0.80, 0.84, 0.89);

// Sem acentos fora do WinAnsi o pdf-lib quebra; a Helvetica padrão cobre o português.
const san = (t) => String(t ?? "").replace(/[Ā-￿]/g, "");

// ⚠ larguras medidas com a lista real: em 178pt o nome cortava ("EDUARDO GABRIEL MOREIRA DOS") e
// em 122pt o cargo virava "Auxiliar de Expedição Sêni". A soma tem de fechar 515pt (A4 menos as
// margens), então a assinatura cedeu o que o nome precisava.
const COLS = [
  { k: "nome", h: "Nome", w: 208 },
  { k: "matricula", h: "Matrícula", w: 56 },
  { k: "cargo", h: "Cargo", w: 136 },
  { k: "assinatura", h: "Assinatura", w: 115 },
];

/**
 * @param {{titulo: string, subtitulo?: string, pessoas: Array<{nome, matricula, cargo, setor}>}} p
 * @returns {Promise<{bytes: Uint8Array, filename: string}>}
 */
export async function gerarListaAssinaturaPDF({ titulo, subtitulo, pessoas }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { logo = null; }

  const wid = (t, f, s) => f.widthOfTextAtSize(san(t), s);
  let page, y;

  const novaPagina = () => {
    page = pdf.addPage(A4);
    page.drawRectangle({ x: 0, y: A4[1] - 62, width: A4[0], height: 62, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - 66, width: A4[0], height: 4, color: ORANGE });
    if (logo) {
      const h = 34, w = h / (logo.height / logo.width);
      page.drawImage(logo, { x: M, y: A4[1] - 31 - h / 2, width: w, height: h });
    }
    const t = "LISTA DE PRESENÇA";
    page.drawText(san(t), { x: A4[0] - M - wid(t, bold, 13), y: A4[1] - 28, size: 13, font: bold, color: rgb(1, 1, 1) });
    const s2 = "Confirmação de participação";
    page.drawText(san(s2), { x: A4[0] - M - wid(s2, font, 8), y: A4[1] - 43, size: 8, font, color: rgb(0.72, 0.79, 0.88) });

    y = A4[1] - 92;
    page.drawText(san(titulo), { x: M, y, size: 13, font: bold, color: NAVY });
    y -= 15;
    if (subtitulo) {
      page.drawText(san(subtitulo), { x: M, y, size: 9.5, font, color: GRAY });
      y -= 14;
    }
    // ⚠ a data de emissão fica NO documento: uma lista de presença sem data não prova quando a
    // campanha aconteceu, que é justamente o que a auditoria pergunta.
    page.drawText(san(`Emitida em ${dataBR(new Date())}`), { x: M, y, size: 9, font, color: GRAY });
    y -= 20;
    cabecalhoTabela();
  };

  const cabecalhoTabela = () => {
    let x = M;
    page.drawRectangle({ x: M, y: y - 16, width: A4[0] - 2 * M, height: 18, color: rgb(0.93, 0.95, 0.97) });
    for (const c of COLS) {
      page.drawText(san(c.h), { x: x + 5, y: y - 11, size: 8, font: bold, color: GRAY });
      x += c.w;
    }
    y -= 18;
  };

  // ⚠ sem travessão: `san()` tira tudo acima do WinAnsi e o "—" sumia, deixando um vão no meio da
  // faixa ("ACABAMENTO  3"). Ponto e vírgula simples resolvem e imprimem igual em qualquer leitor.
  const faixaSetor = (setor, quantos, continuacao = false) => {
    if (y < 120) { novaPagina(); }
    y -= 6;
    page.drawRectangle({ x: M, y: y - 15, width: A4[0] - 2 * M, height: 17, color: rgb(0.97, 0.98, 0.99) });
    const rotulo = continuacao
      ? `${setor.toUpperCase()} (continuação)`
      : `${setor.toUpperCase()}${quantos ? `  ·  ${quantos} ${quantos === 1 ? "pessoa" : "pessoas"}` : ""}`;
    page.drawText(san(rotulo), { x: M + 5, y: y - 11, size: 8.5, font: bold, color: NAVY });
    y -= 17;
  };

  novaPagina();

  // agrupa por setor mantendo uma lista só
  const porSetor = new Map();
  for (const p of pessoas) {
    const s = p.setor || "Sem setor";
    if (!porSetor.has(s)) porSetor.set(s, []);
    porSetor.get(s).push(p);
  }

  let n = 0;
  for (const [setor, lista] of [...porSetor.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    faixaSetor(setor, lista.length);
    for (const p of lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome)))) {
      // ⚠ 26 px por linha: é o mínimo em que cabe uma assinatura de caneta sem invadir a de baixo.
      if (y < 90) { novaPagina(); faixaSetor(setor, null, true); }
      n++;
      let x = M;
      for (const c of COLS) {
        if (c.k === "assinatura") {
          // a linha de assinatura, não o texto
          page.drawLine({ start: { x: x + 6, y: y - 20 }, end: { x: x + c.w - 8, y: y - 20 }, thickness: 0.7, color: LINHA });
        } else {
          const v = c.k === "nome" ? `${n}. ${p.nome || ""}` : (p[c.k] || "—");
          const max = c.w - 10;
          let txt = san(v);
          // ⚠ reticências com TRÊS PONTOS, não "…": o caractere único é fora do WinAnsi e o `san()`
          // o remove — o corte ficaria sem marca nenhuma e a largura calculada, errada.
          if (wid(txt, font, 9) > max) {
            while (wid(txt + "...", font, 9) > max && txt.length > 4) txt = txt.slice(0, -1);
            txt += "...";
          }
          page.drawText(txt, { x: x + 5, y: y - 16, size: 9, font, color: rgb(0.08, 0.12, 0.19) });
        }
        x += c.w;
      }
      page.drawLine({ start: { x: M, y: y - 26 }, end: { x: A4[0] - M, y: y - 26 }, thickness: 0.4, color: rgb(0.90, 0.92, 0.95) });
      y -= 26;
    }
  }

  // rodapé em todas as páginas
  const pags = pdf.getPages();
  pags.forEach((p, i) => {
    const txt = `${titulo} · Torg Metal · ${pessoas.length} colaborador(es) · documento controlado (ISO 9001)`;
    p.drawText(san(txt), { x: M, y: 22, size: 7, font, color: GRAY });
    const pg = `${i + 1}/${pags.length}`;
    p.drawText(pg, { x: A4[0] - M - wid(pg, font, 7), y: 22, size: 7, font, color: GRAY });
  });

  const slug = String(titulo).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").toLowerCase().slice(0, 40);
  return { bytes: await pdf.save(), filename: `Lista de presenca - ${slug}.pdf` };
}
