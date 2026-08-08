import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// PDF do KICK OFF da OP — mesma linguagem dos outros PDFs Torg (faixa navy + filete
// laranja + logo, seções, tabelas, rodapé paginado). Dois tipos:
//   GERAL  → divulgação de início de obra aos setores (escopo, pesos, cronograma,
//            prioridades, pintura, inspeção, atenções). Sem valores em R$.
//   FISCAL → comunicado fiscal/financeiro (dados fiscais, nota de retorno, eventos de
//            faturamento, faturamento por linha, retenção, seguros).
// Substitui o antigo "Salvar PDF" via window.print() (que saía como imagem da tela).

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
const GREEN = rgb(0.02, 0.47, 0.34);
const RED = rgb(0.6, 0.11, 0.11);

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDataStr = (s) => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || "—"); };
const fmtKg = (v) => (v != null && v !== "" ? `${Number(v).toLocaleString("pt-BR")} kg` : "—");
const fmtMoeda = (v) => (v != null && v !== "" ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
const nn = (n) => String(n ?? "").replace(/\D/g, "").padStart(3, "0");
const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const linhasDe = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);

/**
 * @param {object} p { op, kickoff, tipo:"GERAL"|"FISCAL", itens:[{descricao,categoria,faturamentoDireto}] }
 * @returns {Promise<{bytes:Uint8Array, filename:string}>}
 */
export async function gerarKickoffPDF({ op, kickoff, tipo = "GERAL", itens = [] }) {
  const isFiscal = String(tipo).toUpperCase() === "FISCAL";
  const k = kickoff || {};
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }

  const W = A4[0] - 2 * M;
  const obraLinha = [op.cliente, op.obra].filter(Boolean).join(" - ");
  const codigo = `OP-${nn(op.numero)}`;
  const tituloDoc = isFiscal ? "KICK OFF - FISCAL & FINANCEIRO" : "KICK OFF DA OBRA";

  let page, y;
  const paginas = [];
  const quebrar = (texto, fonte, tam, larg) => {
    const out = [];
    for (const par of san(texto).split(/\n+/)) {
      let linha = "";
      for (const p of par.split(/\s+/)) {
        const t = linha ? `${linha} ${p}` : p;
        if (fonte.widthOfTextAtSize(t, tam) <= larg) linha = t;
        else { if (linha) out.push(linha); linha = p; }
      }
      if (linha) out.push(linha);
    }
    return out.length ? out : [""];
  };
  const novaPagina = (comBanda) => {
    page = pdf.addPage(A4);
    paginas.push(page);
    if (comBanda) {
      const h = 96;
      page.drawRectangle({ x: 0, y: A4[1] - h, width: A4[0], height: h, color: NAVY });
      page.drawRectangle({ x: 0, y: A4[1] - h - 4, width: A4[0], height: 4, color: ORANGE });
      if (logo) { const lw = 92, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - h + (h - lh) / 2, width: lw, height: lh }); }
      const x0 = M + (logo ? 118 : 0);
      page.drawText(tituloDoc, { x: x0, y: A4[1] - 44, size: 16, font: bold, color: WHITE });
      page.drawText(san(`${codigo}${obraLinha ? ` - ${obraLinha}` : ""}`), { x: x0, y: A4[1] - 64, size: 10, font, color: rgb(0.8, 0.86, 0.94) });
      page.drawText(san(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`), { x: x0, y: A4[1] - 80, size: 8.5, font, color: rgb(0.66, 0.76, 0.88) });
      y = A4[1] - h - 26;
    } else { y = A4[1] - M; }
  };
  const espaco = (n) => { if (y - n < 70) novaPagina(false); };
  const secao = (titulo) => {
    espaco(46); y -= 10;
    page.drawText(san(titulo.toUpperCase()), { x: M, y, size: 9.5, font: bold, color: isFiscal ? BLUE : GRAY });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE });
    y -= 14;
  };
  const paragrafo = (txt, tam = 10.5, fonte = font, cor = DARK, larg = W, x = M) => {
    if (!txt) return;
    for (const ln of quebrar(txt, fonte, tam, larg)) { espaco(tam + 6); page.drawText(ln, { x, y, size: tam, font: fonte, color: cor }); y -= tam + 4; }
  };
  // Bloco de identificação (rótulo | valor).
  const blocoKV = (linhas) => {
    const ls = linhas.filter(([, v]) => v != null && v !== "" && v !== "—");
    if (!ls.length) return;
    const alt = ls.reduce((s, [, v]) => s + Math.max(1, quebrar(String(v), font, 10, W - 150).length) * 13 + 7, 12);
    espaco(alt + 6);
    const topo = y;
    page.drawRectangle({ x: M, y: y - alt, width: W, height: alt, color: SOFT, borderColor: LINE, borderWidth: 0.8 });
    y -= 15;
    for (const [rot, val] of ls) {
      page.drawText(san(rot), { x: M + 12, y, size: 9, font: bold, color: GRAY });
      const vls = quebrar(String(val), font, 10, W - 150);
      vls.forEach((ln, i) => page.drawText(ln, { x: M + 140, y: y - i * 13, size: 10, font, color: DARK }));
      y -= Math.max(1, vls.length) * 13 + 7;
    }
    y = topo - alt - 14;
  };
  // Lista com marcador.
  const lista = (itensL, marcador, cor = DARK) => {
    for (const it of itensL) {
      const ls = quebrar(it, font, 10, W - 20);
      espaco(ls.length * 14 + 2);
      page.drawText(marcador, { x: M + 2, y, size: 10, font: bold, color: cor });
      ls.forEach((ln, i) => page.drawText(ln, { x: M + 18, y: y - i * 13, size: 10, font, color: DARK }));
      y -= ls.length * 13 + 3;
    }
  };
  // Tabela genérica: cols=[{h,w,a}], rows=[[cell,...]] (a: 'l'|'r'|'c').
  const tabela = (cols, rows) => {
    const cabec = () => {
      espaco(28);
      page.drawRectangle({ x: M, y: y - 6, width: W, height: 20, color: NAVY });
      let x = M + 8;
      for (const c of cols) { page.drawText(san(c.h), { x: c.a === "r" ? x + c.w - 8 - bold.widthOfTextAtSize(san(c.h), 8.5) : c.a === "c" ? x + c.w / 2 - bold.widthOfTextAtSize(san(c.h), 8.5) / 2 : x, y, size: 8.5, font: bold, color: WHITE }); x += c.w; }
      y -= 22;
    };
    cabec();
    rows.forEach((row, i) => {
      const cellLines = row.map((cell, ci) => quebrar(String(cell ?? ""), font, 9.5, cols[ci].w - 12));
      const alt = Math.max(...cellLines.map((l) => l.length)) * 12 + 8;
      if (y - alt < 66) { novaPagina(false); cabec(); }
      if (i % 2) page.drawRectangle({ x: M, y: y - alt + 12, width: W, height: alt, color: SOFT });
      let x = M + 8;
      cellLines.forEach((lines, ci) => {
        lines.forEach((ln, li) => {
          const w = font.widthOfTextAtSize(ln, 9.5);
          const px = cols[ci].a === "r" ? x + cols[ci].w - 16 - w : cols[ci].a === "c" ? x + cols[ci].w / 2 - 8 - w / 2 : x;
          page.drawText(ln, { x: px, y: y - li * 12, size: 9.5, font, color: DARK });
        });
        x += cols[ci].w;
      });
      y -= alt;
      page.drawLine({ start: { x: M, y: y + 10 }, end: { x: M + W, y: y + 10 }, thickness: 0.5, color: LINE });
    });
    y -= 8;
  };
  // Caixa de destaque (aviso).
  const destaque = (texto, cor, bg, borda) => {
    const ls = quebrar(texto, font, 10, W - 24);
    const alt = ls.length * 14 + 14;
    espaco(alt + 6);
    page.drawRectangle({ x: M, y: y - alt + 12, width: W, height: alt, color: bg, borderColor: borda, borderWidth: 0.8 });
    ls.forEach((ln, i) => page.drawText(ln, { x: M + 12, y: y - i * 14, size: 10, font, color: cor }));
    y -= alt + 2;
  };

  novaPagina(true);

  if (!isFiscal) {
    // ── KICK OFF GERAL (setores) ─────────────────────────────────────────
    blocoKV([
      ["Cliente", op.clienteRazaoSocial || op.cliente],
      ["Obra", op.obra],
      ["Pedido do cliente", k.pedidoCompraCliente],
      ["Entrega acordada", k.dataEntregaAcordada ? fmtD(k.dataEntregaAcordada) : ""],
      ["Frete", k.frete === "TORG" ? "Por conta da Torg (CIF)" : k.frete === "CLIENTE" ? "Por conta do cliente (FOB)" : ""],
      ["Local de entrega", k.entregaEndereco],
    ]);

    const incluso = linhasDe(k.escopoIncluso), excluso = linhasDe(k.escopoExcluso);
    if (k.escopo || incluso.length || excluso.length) {
      secao("Escopo do fornecimento");
      if (k.escopo) { paragrafo(k.escopo); y -= 4; }
      if (incluso.length) { paragrafo("Incluido:", 9.5, bold, GREEN); lista(incluso, "+", GREEN); y -= 2; }
      if (excluso.length) { paragrafo("Excluido / por conta do cliente:", 9.5, bold, RED); lista(excluso, "-", RED); }
    }

    const pesos = (Array.isArray(k.pesoResumo) ? k.pesoResumo : []).filter((p) => p?.descricao && !/\btotal\b/i.test(p.descricao));
    if (pesos.length) {
      secao("Resumo de pesos");
      const total = pesos.reduce((s, p) => s + (Number(p.pesoKg) || 0), 0);
      tabela(
        [{ h: "Grupo / item", w: W - 190, a: "l" }, { h: "Qtd", w: 80, a: "r" }, { h: "Peso", w: 110, a: "r" }],
        [...pesos.map((p) => [p.descricao, p.qtd != null ? Number(p.qtd).toLocaleString("pt-BR") : "—", fmtKg(p.pesoKg)]),
         ...(total > 0 ? [["TOTAL", "", fmtKg(Math.round(total))]] : [])],
      );
    }

    const cron = (Array.isArray(k.cronograma) ? k.cronograma : []).filter((c) => c?.fase);
    if (cron.length) {
      secao("Cronograma previo - datas-limite por fase");
      tabela(
        [{ h: "Fase / setor", w: W - 260, a: "l" }, { h: "Data limite", w: 100, a: "c" }, { h: "Obs.", w: 160, a: "l" }],
        cron.map((c) => [c.fase, fmtDataStr(c.data), c.obs || ""]),
      );
    }

    const prios = (Array.isArray(k.prioridades) ? k.prioridades : []).filter((p) => p?.descricao).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if (prios.length) {
      secao("Prioridades de fase / peca / entrega");
      prios.forEach((p, i) => {
        const txt = `${i + 1}. ${p.descricao}${p.data ? ` - ate ${fmtDataStr(p.data)}` : ""}`;
        paragrafo(txt, 10, font, DARK, W - 6, M + 4);
      });
      y -= 4;
    }

    if (k.padraoPintura) { secao("Padrao de pintura"); paragrafo(k.padraoPintura, 10); }
    if (k.inspecao) { secao("Inspecao"); paragrafo(k.inspecao, 10); }
    const pontos = linhasDe(k.pontosAtencao);
    if (pontos.length) { secao("Pontos de atencao"); lista(pontos, "!", RED); }
    if (k.observacoes) { secao("Observacoes"); paragrafo(k.observacoes, 10); }
  } else {
    // ── KICK OFF FISCAL & FINANCEIRO ─────────────────────────────────────
    secao("Dados fiscais do cliente");
    const endFiscal = [op.clienteEndereco, op.clienteCidade && `${op.clienteCidade}/${op.clienteUF || ""}`, op.clienteCep].filter(Boolean).join(" - ");
    blocoKV([
      ["Razao social", op.clienteRazaoSocial || op.cliente],
      ["CNPJ", op.clienteCnpj],
      ["Inscricao Estadual", op.clienteIE],
      ["Endereco fiscal", endFiscal],
      ["Pedido de compra do cliente", k.pedidoCompraCliente],
      ["Local de entrega", k.entregaEndereco],
      ["Frete", k.frete === "TORG" ? "Por conta da Torg (CIF)" : k.frete === "CLIENTE" ? "Por conta do cliente (FOB)" : ""],
    ]);

    destaque(
      `Nota de retorno: ${k.notaRetorno ? "SIM - NECESSARIA" : "nao e necessaria"}${k.notaRetorno && k.notaRetornoObs ? ` - ${k.notaRetornoObs}` : ""}`,
      k.notaRetorno ? rgb(0.45, 0.32, 0.02) : DARK,
      k.notaRetorno ? rgb(1, 0.98, 0.92) : SOFT,
      k.notaRetorno ? rgb(0.96, 0.88, 0.37) : LINE,
    );

    if (k.tipoFaturamento) { secao("Tipo de faturamento (definido na proposta)"); paragrafo(k.tipoFaturamento, 10); }

    const eventos = (Array.isArray(k.faturamentoEventos) ? k.faturamentoEventos : []).filter((e) => e?.descricao);
    if (eventos.length) {
      secao("Eventos de faturamento");
      tabela(
        [{ h: "Evento", w: W - 320, a: "l" }, { h: "%", w: 44, a: "r" }, { h: "Valor", w: 96, a: "r" }, { h: "Prazo pgto.", w: 90, a: "l" }, { h: "Medicao", w: 90, a: "l" }],
        eventos.map((e) => [e.descricao, e.percentual != null ? `${e.percentual}%` : "—", fmtMoeda(e.valor), e.prazoPagamento || "—", e.medicao || "—"]),
      );
    }

    if (k.retencaoContratual) destaque(`Retencao contratual: ${k.retencaoContratual}`, RED, rgb(1, 0.96, 0.96), rgb(0.99, 0.7, 0.7));
    if (k.segurosObrigatorios) { secao("Seguros obrigatorios"); paragrafo(k.segurosObrigatorios, 10); }
    if (k.fiscalObservacao) { secao("Observacoes de faturamento"); paragrafo(k.fiscalObservacao, 10); }

    if (itens.length) {
      secao("Faturamento por linha do pedido");
      tabela(
        [{ h: "Item", w: W - 250, a: "l" }, { h: "Categoria", w: 130, a: "l" }, { h: "Faturamento", w: 120, a: "c" }],
        itens.map((it) => [it.descricao, it.categoria || "—", it.faturamentoDireto ? "Direto (cliente)" : "Torg"]),
      );
    }
  }

  // Aceites (se houver) — registro de quem confirmou o recebimento.
  const aceites = (Array.isArray(k.aceites) ? k.aceites : []).filter((a) => String(a.tipo || "GERAL").toUpperCase() === (isFiscal ? "FISCAL" : "GERAL"));
  if (aceites.length) {
    secao("Registro de aceites");
    tabela(
      [{ h: "E-mail", w: W - 180, a: "l" }, { h: "Status", w: 180, a: "l" }],
      aceites.map((a) => [a.email, a.aceitoEm ? `Confirmado em ${fmtD(a.aceitoEm)}` : "Pendente"]),
    );
  }

  // Rodapé paginado.
  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 52 }, end: { x: A4[0] - M, y: 52 }, thickness: 0.6, color: LINE });
    p.drawText("Torg Metal - Workspace Torg (uso interno)" + (isFiscal ? "" : " · sem valores comerciais"), { x: M, y: 40, size: 8, font, color: GRAY });
    const t = `${san(codigo)}  |  Pagina ${i + 1} de ${total}`;
    p.drawText(t, { x: A4[0] - M - font.widthOfTextAtSize(t, 8), y: 40, size: 8, font, color: GRAY });
  });

  const bytes = await pdf.save();
  return { bytes, filename: `KickOff_${isFiscal ? "Fiscal" : "Geral"}_OP-${nn(op.numero)}.pdf` };
}
