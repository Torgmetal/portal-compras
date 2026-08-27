import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PIT_COLUNAS, PIT_LEGENDA, PIT_LEGENDA_SNQC } from "./pit-padroes";
import { dataBR } from "./data-br";
import { grauNaNorma } from "./pintura-campos";

// ─── O PIT E O PLP NA TELA DE QUEM ACEITA ─────────────────────────────────────
// Vitor (26/08/2026): "o PIT também deve conter o aceite por parte do cliente, não pode deixar de
// ter esse aceite".
//
// ⚠⚠ O ENTREGÁVEL CONTINUA SENDO O EXCEL — Vitor (26/08): "deixar ele no formato excel para ficar
// mais sério, preservar os campos de assinatura". Este PDF não substitui nada: é o que o inspetor
// do cliente LÊ na página de aceite, antes de clicar. Aceite dado sobre um arquivo que a pessoa
// teria de baixar e abrir no Excel é aceite que ninguém leu — e numa auditoria isso é o que se
// pergunta primeiro.
//
// ⚠ MESMO SNAPSHOT DO EXCEL. Os dois saem do que foi enviado, não do cadastro de hoje: o PLP pode
// mudar de cor amanhã, e o que o cliente aceitou não muda junto.

const A4 = [841.89, 595.28];   // paisagem: a tabela do PIT tem oito colunas
const M = 34;
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
const nz = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

export async function gerarPlanoClientePDF({ snapshot = {}, assinaturas = null, minuta = false }) {
  const doc = snapshot.doc === "PIT" ? "PIT" : "PLP";
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
  const titulo = doc === "PIT" ? "PLANO DE INSPEÇÃO E TESTES" : "PLANO DE PINTURA";
  const banda = () => {
    page = pdf.addPage(A4); paginas.push(page);
    const h = 84;
    page.drawRectangle({ x: 0, y: A4[1] - h, width: A4[0], height: h, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - h - 4, width: A4[0], height: 4, color: ORANGE });
    if (logo) { const lw = 84, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - h + (h - lh) / 2, width: lw, height: lh }); }
    const x0 = M + (logo ? 108 : 0);
    page.drawText(san(`${titulo} — ${snapshot.numero || ""}`), { x: x0, y: A4[1] - 36, size: 13, font: bold, color: WHITE });
    page.drawText(san(`Revisão ${nz(snapshot.revisao)} · emitido em ${dataBR(new Date())}`), { x: x0, y: A4[1] - 54, size: 9, font, color: rgb(0.8, 0.86, 0.94) });
    page.drawText("Torg Metal · Qualidade · SGQ ISO 9001", { x: x0, y: A4[1] - 69, size: 8, font, color: rgb(0.66, 0.76, 0.88) });
    // ⚠ MINUTA É AVISO, NÃO ENFEITE. Vitor (26/08/2026) pediu ver o PDF "antes de enviar, para
    // vermos a formatação" — e folha de conferência que sai igual à emitida acaba impressa,
    // assinada à caneta e arquivada como se valesse.
    if (minuta) {
      const t = "MINUTA - NAO ENVIADO";
      const w = bold.widthOfTextAtSize(t, 9);
      page.drawRectangle({ x: A4[0] - M - w - 16, y: A4[1] - 40, width: w + 16, height: 18, color: ORANGE });
      page.drawText(t, { x: A4[0] - M - w - 8, y: A4[1] - 35, size: 9, font: bold, color: WHITE });
    }
    y = A4[1] - h - 22;
  };
  const espaco = (n) => { if (y - n < 56) { banda(); } };
  banda();

  // ── identificação da obra ──
  const ident = [
    ["CLIENTE", snapshot.cliente], ["OBRA", snapshot.obra],
    ["LOCAL", snapshot.local], ["Nº PC/CT", snapshot.pedidoCliente],
    ["OP", `OP-${snapshot.opNumero || ""}`], ["REF. CLIENTE", snapshot.refCliente],
  ].filter(([, v]) => v);
  const colIdent = W / 3;
  ident.forEach(([r, v], i) => {
    const lin = Math.floor(i / 3);
    const x = M + (i % 3) * colIdent;
    const yy = y - lin * 26;
    page.drawText(r, { x, y: yy, size: 6.5, font: bold, color: GRAY });
    page.drawText(san(String(v)).slice(0, 58), { x, y: yy - 11, size: 9, font, color: DARK });
  });
  y -= Math.ceil(ident.length / 3) * 26 + 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE });
  y -= 16;

  const secao = (t) => {
    espaco(26);
    page.drawText(san(t), { x: M, y, size: 9, font: bold, color: NAVY });
    y -= 5; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: ORANGE }); y -= 14;
  };

  /** Uma tabela com quebra de linha e repetição de cabeçalho a cada página. */
  const tabela = (cols, linhas, { tam = 7.5 } = {}) => {
    const cabec = () => {
      espaco(20);
      page.drawRectangle({ x: M, y: y - 16, width: W, height: 16, color: NAVY });
      let cx = M + 4;
      for (const c of cols) { page.drawText(san(c.t), { x: cx, y: y - 11, size: 6.8, font: bold, color: WHITE }); cx += c.w; }
      y -= 16;
    };
    cabec();
    linhas.forEach((ln, i) => {
      const celulas = cols.map((c, k) => quebrar(ln[k] ?? "", font, tam, c.w - 7));
      const alt = Math.max(14, Math.max(...celulas.map((x) => x.length)) * (tam + 1.6) + 5);
      if (y - alt < 56) { banda(); cabec(); }
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - alt, width: W, height: alt, color: SOFT });
      let cx = M + 4;
      celulas.forEach((linhasCel, k) => {
        linhasCel.forEach((t, j) => page.drawText(t, { x: cx, y: y - 10 - j * (tam + 1.6), size: tam, font: k === 0 ? bold : font, color: DARK }));
        cx += cols[k].w;
      });
      y -= alt;
      page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.3, color: LINE });
    });
    y -= 12;
  };

  if (doc === "PIT") {
    const nomes = snapshot.snqc ? PIT_COLUNAS.snqc : PIT_COLUNAS.comum;
    // larguras proporcionais: o escopo e o critério são o que se lê; item e percentuais são estreitos
    const pesos = snapshot.snqc ? [26, 120, 190, 130, 78, 110, 130, 60] : [26, 120, 200, 42, 48, 130, 168, 60];
    const soma = pesos.reduce((a, b) => a + b, 0);
    const cols = nomes.map((t, i) => ({ t, w: (pesos[i] / soma) * W }));
    secao(`Escopo de inspeção — ${snapshot.nomePadrao || ""}`);
    tabela(cols, snapshot.linhas || []);

    secao("Legenda");
    const leg = [...PIT_LEGENDA, ...(snapshot.snqc ? PIT_LEGENDA_SNQC : [])];
    leg.forEach(([sig, txt], i) => {
      if (i % 3 === 0) espaco(14);
      const x = M + (i % 3) * (W / 3);
      page.drawText(san(sig), { x, y, size: 7.5, font: bold, color: DARK });
      page.drawText(san(txt), { x: x + 30, y, size: 7.5, font, color: GRAY });
      if (i % 3 === 2 || i === leg.length - 1) y -= 12;
    });
    y -= 10;
  } else {
    // ⚠ documentos de referência e índice de revisões são a CAPA do documento (folha 1). Vitor
    // (27/08/2026): "no caso de revisão precisamos ter esse registro" — o cliente que recebe uma
    // R01 tem de ler, no próprio documento, o que mudou da R00.
    if (snapshot.documentosReferencia) {
      espaco(24);
      page.drawText("DOCUMENTOS DE REFERÊNCIA", { x: M, y, size: 6.5, font: bold, color: GRAY });
      page.drawText(san(snapshot.documentosReferencia), { x: M, y: y - 11, size: 9, font, color: DARK });
      y -= 28;
    }

    if ((snapshot.revisoes || []).length) {
      secao("Índice de revisões");
      tabela([
        { t: "REV.", w: W * 0.06 }, { t: "DATA", w: W * 0.1 }, { t: "DESCRIÇÃO", w: W * 0.42 },
        { t: "ELABORADO", w: W * 0.14 }, { t: "VERIFICADO", w: W * 0.14 }, { t: "APROVADO", w: W * 0.14 },
      ], snapshot.revisoes.map((r) => [nz(r.revisao), nz(r.data), nz(r.descricao), nz(r.elaborado), nz(r.verificado), nz(r.aprovado)]), { tam: 8 });
    }

    // ⚠⚠ JATEAMENTO NÃO É PINTURA. "Método de aplicação" (airless, trincha) estava aqui dentro,
    // entre grau de limpeza e rugosidade — que são do JATEAMENTO, medidos antes de pintar. Vitor
    // (27/08/2026): "muita informação que é de jateamento está em pintura e vice-versa". Ele foi
    // para o esquema de pintura, que é onde a pergunta "como se aplica" é feita.
    secao("Preparação de superfície (jateamento)");
    const prep = [
      ["Método", nz(snapshot.preparoMetodo)],
      // ⚠ a notação da NORMA, não o nosso id: a ISO 8501-1 escreve Sa 2½, e é isso que o inspetor
      // do cliente procura na folha. (Vitor, 27/08/2026)
      ["Grau de limpeza", nz(grauNaNorma(snapshot.grauLimpeza))],
      ["Abrasivo", nz(snapshot.abrasivo)],
      ["Rugosidade", snapshot.rugosidadeMin || snapshot.rugosidadeMax ? `${nz(snapshot.rugosidadeMin)} a ${nz(snapshot.rugosidadeMax)} µm` : "—"],
    ];
    prep.forEach(([r, v], i) => {
      if (i % 2 === 0) espaco(24);
      const x = M + (i % 2) * (W / 2);
      page.drawText(r, { x, y, size: 6.5, font: bold, color: GRAY });
      page.drawText(san(v), { x, y: y - 11, size: 9, font, color: DARK });
      if (i % 2 === 1 || i === prep.length - 1) y -= 26;
    });
    y -= 4;

    secao("Esquema de pintura");
    if (snapshot.metodoAplicacao) {
      espaco(24);
      page.drawText("MÉTODO DE APLICAÇÃO", { x: M, y, size: 6.5, font: bold, color: GRAY });
      page.drawText(san(snapshot.metodoAplicacao), { x: M, y: y - 11, size: 9, font, color: DARK });
      y -= 26;
    }
    tabela([
      { t: "DEMÃO", w: W * 0.14 }, { t: "PRODUTO", w: W * 0.3 }, { t: "FABRICANTE", w: W * 0.18 },
      { t: "COR", w: W * 0.18 }, { t: "ESPESSURA SECA (µm)", w: W * 0.2 },
    ], (snapshot.demaos || []).map((d) => [
      d.nome || `${d.ordem}ª demão`, nz(d.produto), nz(d.fabricante), nz(d.cor),
      d.espessuraMin || d.espessuraMax ? `${nz(d.espessuraMin)} a ${nz(d.espessuraMax)}` : "—",
    ]), { tam: 8 });
    if (snapshot.espessuraTotal) {
      espaco(16);
      page.drawText(san(`Espessura total do sistema: ${snapshot.espessuraTotal} µm`), { x: M, y, size: 8.5, font: bold, color: DARK });
      y -= 18;
    }

    // §2 do documento: o produto de verdade, com lote, diluição, camada úmida e secagem
    const comEspec = (snapshot.demaos || []).filter((d) => d.lote || d.diluicao || d.camadaUmida || d.secagem || d.componentes);
    if (comEspec.length) {
      secao("Especificações das tintas");
      // ⚠ COMPONENTES NA COLUNA DO PRODUTO, em segunda linha. Tinta epóxi e PU são bicomponentes: o
      // plano que cita só a base manda aplicar metade do produto. Cabem aqui sem uma oitava coluna,
      // que espremeria as sete que a folha já tem.
      tabela([
        { t: "ESPECIFICAÇÃO", w: W * 0.15 }, { t: "PRODUTO / COMPONENTES", w: W * 0.26 }, { t: "FABRICANTE", w: W * 0.13 },
        { t: "LOTE / R", w: W * 0.1 }, { t: "DILUIÇÃO", w: W * 0.12 }, { t: "CAMADA ÚMIDA (µm)", w: W * 0.12 },
        { t: "SECAGEM / POT LIFE", w: W * 0.14 },
      ], comEspec.map((d) => [
        nz(d.nome),
        [d.produto, d.componentes].filter(Boolean).join("\n") || "—",
        nz(d.fabricante), nz(d.lote), nz(d.diluicao),
        // ⚠⚠ A ÚMIDA DE CADA DILUIÇÃO, não só a escolhida. Vitor (27/08/2026): "você deve fazer o
        // cálculo para 0%, 10% e 15% de diluição". O pintor dilui conforme o dia (temperatura,
        // equipamento) e precisa ler na folha a espessura úmida daquela condição — um número só
        // manda ele calcular no galpão, que é onde o erro acontece.
        (d.umidas || []).length
          ? d.umidas.map((x) => (Number(x.d) === 0 ? `sem dil.: ${x.u}` : `${x.d}%: ${x.u}`)).join("\n")
          : nz(d.camadaUmida),
        [d.secagem, d.potLife && `pot life ${d.potLife}`].filter(Boolean).join("\n") || "—",
      ]), { tam: 8 });
    }

    if ((snapshot.itens || []).length) {
      secao("Sistema de pintura da estrutura metálica");
      // ⚠ INTERNO/EXTERNO são colunas da folha 3: a face interna de um equipamento não leva o mesmo
      // acabamento da externa, e o inspetor confere item a item por essas duas marcas.
      const face = (i) => [i.interno ? "interno" : "", i.externo ? "externo" : ""].filter(Boolean).join(" · ");
      tabela([
        { t: "EQUIPAMENTO / CONJUNTO", w: W * 0.34 }, { t: "FACE", w: W * 0.12 }, { t: "SISTEMA", w: W * 0.1 },
        { t: "COR DE ACABAMENTO", w: W * 0.2 }, { t: "OBSERVAÇÃO", w: W * 0.24 },
      ], snapshot.itens.map((i) => [nz(i.item), face(i) || "—", nz(i.sistema), nz(i.cor), nz(i.obs)]), { tam: 8 });
    }

    if (snapshot.observacoes) {
      secao("Observações");
      for (const ln of quebrar(snapshot.observacoes, font, 8.5, W)) {
        espaco(13);
        page.drawText(ln, { x: M, y, size: 8.5, font, color: DARK });
        y -= 12;
      }
      y -= 8;
    }
  }

  // ── as aprovações ──
  //
  // ⚠⚠ TRÊS PAPÉIS, NESTA ORDEM: quem elabora, quem verifica, quem aceita pelo cliente. Vitor
  // (26/08/2026): "deixar o campo de elaborado e verificado (…) e enviar para esses e-mails antes,
  // para depois ir até o cliente". O quadro sai impresso mesmo vazio: é ele que diz, na folha, que
  // este documento depende dessas três assinaturas — folha sem o quadro passa por documento pronto.
  espaco(74);
  secao("Aprovações");
  const r = snapshot.responsaveis || {};
  const doCliente = (assinaturas || []).find((a) => a.assinadoEm) || (assinaturas || [])[0] || null;
  const blocos = [
    { papel: "ELABORADO POR", nome: r.elaborado?.nome, em: r.elaborado?.assinadoEm },
    { papel: "VERIFICADO POR", nome: r.verificado?.nome, em: r.verificado?.assinadoEm },
    { papel: "INSPETOR DO CLIENTE / QUALIDADE", nome: doCliente?.nome, em: doCliente?.assinadoEm, ip: doCliente?.ip },
  ];
  const larg = W / 3;
  blocos.forEach((b, i) => {
    const x = M + i * larg;
    page.drawRectangle({ x, y: y - 14, width: larg - 8, height: 14, color: GRAY });
    page.drawText(san(b.papel), { x: x + 5, y: y - 10.5, size: 6.5, font: bold, color: WHITE });
    page.drawText(san(b.nome || "—"), { x: x + 5, y: y - 26, size: 9, font, color: DARK });
    page.drawLine({ start: { x, y: y - 40 }, end: { x: x + larg - 8, y: y - 40 }, thickness: 0.8, color: LINE });
    if (b.em) {
      page.drawText(san(`Assinado em ${fmtDT(b.em)}`), { x: x + 5, y: y - 50, size: 7, font: bold, color: GREEN });
      if (b.ip) page.drawText(san(`IP ${b.ip}`), { x: x + 5, y: y - 59, size: 6.5, font, color: GRAY });
    } else {
      page.drawText("Data: ____ / ____ / ________", { x: x + 5, y: y - 50, size: 7, font, color: GRAY });
    }
  });
  y -= 68;
  page.drawText("Assinaturas eletrônicas registradas no portal (confirmação + data/hora + IP).", { x: M, y, size: 7, font, color: GRAY });
  y -= 12;

  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.drawText(san(`Torg Metal · ${titulo} · ${snapshot.numero || ""} · Rev. ${nz(snapshot.revisao)} · documento controlado`), { x: M, y: 24, size: 7, font, color: GRAY });
    const pg = `Página ${i + 1} de ${total}`;
    p.drawText(pg, { x: A4[0] - M - font.widthOfTextAtSize(pg, 7), y: 24, size: 7, font, color: GRAY });
  });

  return pdf.save();
}
