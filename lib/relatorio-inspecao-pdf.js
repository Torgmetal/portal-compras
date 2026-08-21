import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dataBR } from "./data-br";
import { TIPO_LABEL, ORIGEM_LABEL } from "./qualidade-campo";

// RELATÓRIO DE INSPEÇÃO — o documento que sai das fotos tiradas no chão de fábrica.
//
// Segue o padrão dos outros documentos da Qualidade: faixa navy + filete laranja, código e data no
// topo, bloco de ASSINATURAS ELETRÔNICAS no fim (nome, papel, data/hora e IP).
//
// ⚠ Cada foto sai com a PEÇA e COMO ela foi identificada. "R lido no QR" é o desenho dizendo qual
// peça é; "escolhida na lista" é uma pessoa afirmando. Numa auditoria isso não vale a mesma coisa,
// e esconder a diferença seria dar ao segundo a força do primeiro.

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0, 38 / 255, 63 / 255);
const GRAY = rgb(0.36, 0.45, 0.52);
const LINE = rgb(0.886, 0.914, 0.941);
const SOFT = rgb(0.965, 0.975, 0.985);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.02, 0.47, 0.34);

const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const fmtDT = (d) => { if (!d) return "—"; const x = new Date(d); return isNaN(x) ? "—" : `${x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${x.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`; };

/** Baixa a foto do Blob. Falha de rede não derruba o relatório inteiro — a página diz que faltou. */
async function baixar(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

export async function gerarRelatorioInspecaoPDF({ rel, fotos = [], assinaturas = null, desenhoBytes = null }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }
  const W = A4[0] - 2 * M;

  const quebrar = (t, f, tam, larg) => {
    const out = [];
    for (const par of san(t).split(/\n+/)) {
      let l = "";
      for (const p of par.split(/\s+/)) {
        const cand = l ? `${l} ${p}` : p;
        if (f.widthOfTextAtSize(cand, tam) <= larg) l = cand;
        else { if (l) out.push(l); l = p; }
      }
      if (l) out.push(l);
    }
    return out.length ? out : [""];
  };

  let page, y;
  const paginas = [];
  const banda = () => {
    page = pdf.addPage(A4); paginas.push(page);
    const h = 92;
    page.drawRectangle({ x: 0, y: A4[1] - h, width: A4[0], height: h, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - h - 4, width: A4[0], height: 4, color: ORANGE });
    if (logo) { const lw = 88, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - h + (h - lh) / 2, width: lw, height: lh }); }
    const x0 = M + (logo ? 112 : 0);
    page.drawText(san(String(TIPO_LABEL[rel.tipo] || "Relatório de inspeção").toUpperCase()), { x: x0, y: A4[1] - 40, size: 13, font: bold, color: WHITE });
    page.drawText(san(`${rel.codigo} · OP-${rel.opNumero} · ${dataBR(rel.emitidoEm || new Date())}`), { x: x0, y: A4[1] - 60, size: 9.5, font, color: rgb(0.8, 0.86, 0.94) });
    page.drawText("Torg Metal · Qualidade · SGQ ISO 9001", { x: x0, y: A4[1] - 76, size: 8.5, font, color: rgb(0.66, 0.76, 0.88) });
    y = A4[1] - h - 24;
  };
  const espaco = (n) => { if (y - n < 60) banda(); };
  // página LIMPA (sem a faixa navy) para o desenho ocupar a folha inteira
  const novaPaginaDesenho = () => { page = pdf.addPage(A4); paginas.push(page); y = A4[1] - M; };
  banda();

  // ── Identificação ──
  // ⚠ larguras PRÓPRIAS, não W/4. "Inspeção dimensional e visual" não cabe em um quarto da página
  // e invadia a coluna do inspetor, colando as duas informações uma na outra.
  const fit = (txt, f, tam, larg) => {
    let t = san(txt);
    if (f.widthOfTextAtSize(t, tam) <= larg) return t;
    while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, tam) > larg) t = t.slice(0, -1);
    return `${t}...`;
  };
  const linhas = [
    ["Obra", `OP-${rel.opNumero}`, 78],
    ["Inspeção", TIPO_LABEL[rel.tipo] || rel.tipo, 190],
    ["Inspetor", rel.inspetor || rel.criadoPorNome || "—", 160],
    ["Registros", `${fotos.length} foto(s)`, W - 78 - 190 - 160],
  ];
  page.drawRectangle({ x: M, y: y - 52, width: W, height: 52, color: SOFT });
  let cx = M + 10;
  for (const [rot, val, larg] of linhas) {
    page.drawText(san(rot.toUpperCase()), { x: cx, y: y - 18, size: 7, font: bold, color: GRAY });
    page.drawText(fit(val, bold, 10, larg - 12), { x: cx, y: y - 34, size: 10, font: bold, color: DARK });
    cx += larg;
  }
  y -= 66;

  if (rel.titulo) {
    espaco(20);
    page.drawText(san(rel.titulo), { x: M, y, size: 11, font: bold, color: DARK });
    y -= 18;
  }
  if (rel.observacoes) {
    for (const ln of quebrar(rel.observacoes, font, 9.5, W)) {
      espaco(14);
      page.drawText(ln, { x: M, y, size: 9.5, font, color: DARK });
      y -= 13;
    }
    y -= 6;
  }

  // ── DIMENSIONAL: tabela de medidas ──────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026): "no dimensional não vamos usar fotos... as dimensões do projeto você deve
  // preencher; já as dimensões encontradas você deve deixar para o elaborador do relatório".
  const linhasDim = Array.isArray(rel.linhas) ? rel.linhas : [];
  if (linhasDim.length) {
    espaco(24);
    page.drawText("DIMENSÕES", { x: M, y, size: 9, font: bold, color: GRAY });
    const tol = rel.resultados?.tolerancia;
    if (tol) {
      const t = san(`Tolerâncias conforme ${tol}`);
      page.drawText(t, { x: M + W - font.widthOfTextAtSize(t, 7.5), y, size: 7.5, font, color: GRAY });
    }
    y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE }); y -= 14;

    const dc = [
      { t: "Peça", w: 92 },
      { t: "Descrição", w: 118 },
      { t: "Qtd", w: 34, dir: true },
      { t: "Projeto (mm)", w: 78, dir: true },
      { t: "Encontrado (mm)", w: 92, dir: true },
      { t: "Obs.", w: W - 414 },
    ];
    espaco(16); let dx = M + 6;
    for (const c of dc) {
      const tw = c.dir ? c.w - 12 - bold.widthOfTextAtSize(c.t, 7.5) : 0;
      page.drawText(c.t, { x: dx + tw, y, size: 7.5, font: bold, color: GRAY });
      dx += c.w;
    }
    y -= 13;

    for (const l of linhasDim) {
      espaco(15); dx = M + 6;
      const cels = [
        String(l.marca || "-"),
        String(l.descricao || "-"),
        l.qtd != null ? String(l.qtd) : "-",
        l.projetoMm != null ? String(l.projetoMm) : "-",
        // VAZIO enquanto o elaborador não preencher: um "-" aqui sugeriria que mediram e não
        // acharam nada; a célula em branco mostra o que ainda falta medir.
        l.encontradoMm != null ? String(l.encontradoMm) : "",
        String(l.obs || ""),
      ];
      cels.forEach((v, i) => {
        const c = dc[i];
        const f = i === 4 ? bold : font;
        const txt = san(v).slice(0, 60);
        const tw = c.dir ? c.w - 12 - f.widthOfTextAtSize(txt, 8) : 0;
        page.drawText(txt, { x: dx + tw, y, size: 8, font: f, color: DARK });
        dx += c.w;
      });
      y -= 13; page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + W, y: y + 4 }, thickness: 0.3, color: LINE });
    }

    const res = rel.resultados || {};
    const quadros = [["DIMENSIONAL", res.dimensional], ["ALINHAMENTO", res.alinhamento], ["ACABAMENTO", res.acabamento], ["RESULTADO", res.resultado]];
    y -= 14; espaco(34);
    const qw = W / quadros.length;
    let qx = M;
    for (const [rot, val] of quadros) {
      page.drawRectangle({ x: qx, y: y - 26, width: qw - 6, height: 26, color: SOFT });
      page.drawText(rot, { x: qx + 8, y: y - 10, size: 6.5, font: bold, color: GRAY });
      const cor = val === "APROVADO" ? GREEN : val === "REPROVADO" ? rgb(0.78, 0.12, 0.12) : val ? ORANGE : GRAY;
      page.drawText(san(val || "a preencher"), { x: qx + 8, y: y - 21, size: 8.5, font: bold, color: cor });
      qx += qw;
    }
    y -= 40;
  }

  // ── Evidências ──
  if (fotos.length) {
  espaco(24);
  page.drawText("EVIDÊNCIAS FOTOGRÁFICAS", { x: M, y, size: 9, font: bold, color: GRAY });
  y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE }); y -= 16;

  // duas por linha: a foto de inspeção precisa de tamanho pra mostrar o defeito, e quatro por
  // linha viram miniatura que não prova nada
  const colW = (W - 14) / 2;
  const imgH = 150;
  const blocoH = imgH + 34;

  for (let i = 0; i < fotos.length; i += 2) {
    espaco(blocoH + 6);
    const yTopo = y;
    for (const [k, f] of [[0, fotos[i]], [1, fotos[i + 1]]]) {
      if (!f) continue;
      const x = M + k * (colW + 14);
      const bin = await baixar(f.url);
      let img = null;
      if (bin) { try { img = await pdf.embedJpg(bin); } catch { try { img = await pdf.embedPng(bin); } catch { img = null; } } }

      page.drawRectangle({ x, y: yTopo - imgH, width: colW, height: imgH, color: SOFT });
      if (img) {
        // encaixa mantendo proporção — foto esticada distorce o que se quer mostrar
        const escala = Math.min(colW / img.width, imgH / img.height);
        const w = img.width * escala, h = img.height * escala;
        page.drawImage(img, { x: x + (colW - w) / 2, y: yTopo - imgH + (imgH - h) / 2, width: w, height: h });
      } else {
        page.drawText("(foto indisponível)", { x: x + 8, y: yTopo - imgH / 2, size: 8, font, color: GRAY });
      }

      const legenda = f.marca ? `Peça ${f.marca}` : "Registro geral";
      page.drawText(san(legenda), { x, y: yTopo - imgH - 12, size: 8.5, font: bold, color: DARK });
      const sub = [f.origemMarca ? ORIGEM_LABEL[f.origemMarca] : null, f.capturadaEm ? fmtDT(f.capturadaEm) : null, f.autorNome]
        .filter(Boolean).join(" · ");
      page.drawText(san(sub).slice(0, 90), { x, y: yTopo - imgH - 23, size: 7, font, color: GRAY });
      if (f.observacao) {
        page.drawText(san(f.observacao).slice(0, 80), { x, y: yTopo - imgH - 32, size: 7.5, font, color: DARK });
      }
    }
    y = yTopo - blocoH - 8;
  }

  }

  // ── Instrumentos utilizados ──
  //
  // Os modelos do Vitor trazem esse quadro em todos os formulários (a trena, o esquadro, o
  // paquímetro, com o nº do certificado de calibração). Aqui ele sai do que o inspetor marcou no
  // celular, com a validade que estava valendo no dia.
  const instrumentos = Array.isArray(rel.equipamentos) ? rel.equipamentos : [];
  if (instrumentos.length) {
    y -= 10; espaco(50);
    page.drawText("INSTRUMENTOS UTILIZADOS", { x: M, y, size: 9, font: bold, color: GRAY });
    y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE }); y -= 14;
    const ic = [{ t: "Instrumento", w: 240 }, { t: "Certificado de calibração", w: 160 }, { t: "Validade", w: W - 400 }];
    espaco(16); let ix = M + 6;
    for (const c of ic) { page.drawText(c.t, { x: ix, y, size: 7.5, font: bold, color: GRAY }); ix += c.w; }
    y -= 13;
    for (const e of instrumentos) {
      espaco(15); ix = M + 6;
      page.drawText(san(e.nome || "—").slice(0, 52), { x: ix, y, size: 8, font, color: DARK }); ix += ic[0].w;
      page.drawText(san(e.certificado || "—"), { x: ix, y, size: 8, font, color: DARK }); ix += ic[1].w;
      const val = e.validade ? san(String(e.validade).split("-").reverse().join("/")) : "sem validade";
      // ⚠ vencido sai em VERMELHO e nomeado. Um relatório que cita instrumento fora de calibração
      // sem dizer que está fora vale menos que um sem instrumento nenhum — some com a informação
      // que o auditor mais procura.
      page.drawText(e.vencido ? `${val} — VENCIDO` : val, { x: ix, y, size: 7.5, font: e.vencido ? bold : font, color: e.vencido ? rgb(0.78, 0.12, 0.12) : GRAY });
      y -= 13; page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + W, y: y + 4 }, thickness: 0.3, color: LINE });
    }
  }

  // ── Assinaturas eletrônicas ──
  y -= 14; espaco(70);
  page.drawText("ASSINATURAS ELETRÔNICAS", { x: M, y, size: 9, font: bold, color: GRAY });
  y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE }); y -= 14;
  if (assinaturas?.length) {
    const ac = [{ t: "Nome", w: 150 }, { t: "Papel", w: 110 }, { t: "Assinatura / data", w: 150 }, { t: "IP", w: W - 410 }];
    espaco(16); let ax = M + 6;
    for (const c of ac) { page.drawText(c.t, { x: ax, y, size: 7.5, font: bold, color: GRAY }); ax += c.w; }
    y -= 13;
    for (const a of assinaturas) {
      espaco(15); ax = M + 6;
      page.drawText(san(a.nome || "—"), { x: ax, y, size: 8, font, color: DARK }); ax += ac[0].w;
      page.drawText(san(a.setor || "—"), { x: ax, y, size: 8, font, color: DARK }); ax += ac[1].w;
      if (a.assinadoEm) page.drawText(san("Assinado " + fmtDT(a.assinadoEm)), { x: ax, y, size: 7.5, font: bold, color: GREEN });
      else page.drawText("Aguardando assinatura", { x: ax, y, size: 7.5, font, color: ORANGE });
      ax += ac[2].w;
      page.drawText(san(a.ip || "—"), { x: ax, y, size: 7.5, font, color: GRAY });
      y -= 13; page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + W, y: y + 4 }, thickness: 0.3, color: LINE });
    }
  } else {
    for (const ln of quebrar("Documento para conferência. As assinaturas são coletadas eletronicamente no portal, com confirmação, data/hora e IP de cada assinante.", font, 8.5, W)) {
      page.drawText(ln, { x: M, y, size: 8.5, font, color: GRAY }); y -= 12;
    }
  }

  // ── O DESENHO, com as cotas — ANEXO, no fim ─────────────────────────────────────────────────
  //
  // Embutido como PÁGINA do PDF original (embedPdf), não como imagem: sai em vetor, as cotas ficam
  // legíveis em qualquer zoom e o arquivo não incha. É o "print do conjunto" que o Vitor pediu.
  //
  // ⚠ VAI POR ÚLTIMO. Quando ficava no meio, os blocos seguintes (instrumentos, assinaturas)
  // continuavam escrevendo NA PÁGINA DO DESENHO e saíam por cima do título dele.
  if (typeof desenhoBytes === "function") {
    for (const d of Array.isArray(rel.desenhos) ? rel.desenhos : []) {
      const bytes = await desenhoBytes(d);
      if (!bytes) continue;
      let emb = null;
      try { [emb] = await pdf.embedPdf(bytes, [0]); } catch { emb = null; }
      if (!emb) continue;

      novaPaginaDesenho();
      page.drawText(san(`DESENHO ${d.marca}`), { x: M, y: A4[1] - M - 10, size: 9, font: bold, color: GRAY });
      const dispW = A4[0] - 2 * M;
      const dispH = A4[1] - 2 * M - 40;
      const esc = Math.min(dispW / emb.width, dispH / emb.height);
      page.drawPage(emb, {
        x: M + (dispW - emb.width * esc) / 2,
        y: M + 20 + (dispH - emb.height * esc) / 2,
        width: emb.width * esc,
        height: emb.height * esc,
      });
    }
  }


  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawText(san(`Torg Metal · ${rel.codigo} · OP-${rel.opNumero}`), { x: M, y: 28, size: 7.5, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7.5), y: 28, size: 7.5, font, color: GRAY });
  });

  return pdf.save();
}
