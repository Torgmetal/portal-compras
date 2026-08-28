import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PIT_COLUNAS, PIT_GRUPOS, PIT_LEGENDA, PIT_LEGENDA_SNQC, pctAvaliado } from "./pit-padroes";
import { dataBR } from "./data-br";
import { grauNaNorma } from "./pintura-campos";

/** Embute a imagem da assinatura (uma vez por documento). Falha de rede não derruba o PDF. */
const cacheImg = new WeakMap();
async function imagemDaAssinatura(pdf, url) {
  if (!url) return null;
  let mapa = cacheImg.get(pdf);
  if (!mapa) { mapa = new Map(); cacheImg.set(pdf, mapa); }
  if (mapa.has(url)) return mapa.get(url);
  let img = null;
  try {
    const r = await fetch(url);
    if (r.ok) {
      const bin = Buffer.from(await r.arrayBuffer());
      try { img = await pdf.embedPng(bin); } catch { try { img = await pdf.embedJpg(bin); } catch { img = null; } }
    }
  } catch { img = null; }
  mapa.set(url, img);
  return img;
}

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

// ⚠⚠ O QUE NÃO É LATIN-1 É APAGADO na última troca (a fonte padrão do pdf-lib não tem o glifo) — e
// apagar um operador MUDA O CRITÉRIO: "Ultrassom 100% JTPT (espessura ≥ 8,00mm)" saía impresso como
// "(espessura 8,00mm)" no PIT do padrão SNQC, que é documento de aceitação do cliente. O que tem
// significado técnico sai transliterado; o resto, que é enfeite, continua caindo fora.
const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
  .replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/≠/g, "!=").replace(/≈/g, "~").replace(/[→➔]/g, "->")
  .replace(/[^\x00-\xFF]/g, "");
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

  /**
   * Uma tabela com quebra de linha e repetição de cabeçalho a cada página.
   *
   * `agrupar` liga o comportamento de CÉLULA MESCLADA: linha sem a primeira coluna continua o item
   * de cima. Vitor (27/08/2026), sobre o PIT: "não está mesclando os itens 5 e 6, fica em uma única
   * linha e cita as de baixo, fica parecendo solta". Sem isso, "Qualificação de Soldadores" e
   * "Certificado de Consumíveis" ficam pendurados sem dono — e num plano de inspeção, item sem
   * número é item que ninguém audita.
   *
   * `al` por coluna: "c" centraliza; "n" centraliza só quando o valor é curto (percentuais e
   * códigos ficam alinhados; critério em texto longo continua à esquerda).
   */
  const alinhar = (texto, col, larg) => {
    const modo = col.al === "n" ? (texto.length <= 8 ? "c" : "l") : col.al || "l";
    if (modo !== "c") return 0;
    return Math.max(0, (larg - 7 - font.widthOfTextAtSize(texto, col.__tam || 7.5)) / 2);
  };

  // ⚠⚠ CABEÇALHO EM DOIS NÍVEIS. O cliente da OP-068 (28/08/2026) devolveu o PIT dizendo que o
  // modelo do portal "está confuso" e mandou o dele: "Tipo de Inspeção" é UM título sobre DUAS
  // colunas (TORG e Cliente), como "Escopo de Inspeção" é um título sobre a etapa e o que se
  // inspeciona. Sem isso, cada coluna precisa de um rótulo próprio que ou mente ou não cabe.
  // `grupos: [{ t, de, ate }]` desenha a faixa de cima; o `t` da coluna vai na linha de baixo, e
  // um `t` com "\n" quebra em duas linhas (rótulo longo em coluna estreita invadia a vizinha).
  const tabela = (cols, linhas, { tam = 7.5, agrupar = false, gruposCabec = null } = {}) => {
    for (const c of cols) c.__tam = tam;
    const cabec = () => {
      const sub = cols.map((c) => String(c.t || "").split("\n"));
      const nSub = Math.max(1, ...sub.map((l) => l.length));
      const h = gruposCabec?.length ? 12 + nSub * 9 : Math.max(16, nSub * 9 + 7);
      espaco(h + 4);
      page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: NAVY });
      const xDe = (k) => M + cols.slice(0, k).reduce((a, c) => a + c.w, 0);
      const escrever = (t, x, larg, yy, centrar) => {
        const dx = centrar ? Math.max(0, (larg - 7 - bold.widthOfTextAtSize(san(t), 6.8)) / 2) : 0;
        page.drawText(san(t), { x: x + 4 + dx, y: yy, size: 6.8, font: bold, color: WHITE });
      };
      // faixa de cima: o título do grupo, centrado sobre as colunas que ele cobre
      for (const g of gruposCabec || []) {
        const x = xDe(g.de);
        const larg = cols.slice(g.de, g.ate + 1).reduce((a, c) => a + c.w, 0);
        escrever(g.t, x, larg, y - 10, true);
        // filete separando o grupo do rótulo de baixo, para o olho ver que os dois são um só campo
        page.drawLine({ start: { x: x + 3, y: y - 13 }, end: { x: x + larg - 5, y: y - 13 }, thickness: 0.4, color: WHITE });
      }
      // e o rótulo de cada coluna: sob o grupo quando há um, senão ocupando a faixa inteira
      const emGrupo = (k) => (gruposCabec || []).some((g) => k >= g.de && k <= g.ate);
      cols.forEach((c, k) => {
        const base = gruposCabec?.length && !emGrupo(k) ? y - 10 : y - (gruposCabec?.length ? 22 : 11);
        sub[k].forEach((t, j) => {
          if (t) escrever(t, xDe(k), c.w, base - j * 9, c.al === "c" || c.al === "n" || emGrupo(k));
        });
      });
      y -= h;
    };
    cabec();

    // ── monta os GRUPOS: uma linha com a primeira coluna vazia continua a anterior ──
    const grupos = [];
    linhas.forEach((ln) => {
      const nova = !agrupar || String(ln[0] ?? "").trim() !== "" || !grupos.length;
      if (nova) grupos.push([ln]);
      else grupos[grupos.length - 1].push(ln);
    });

    let zebra = 0;
    for (const grupo of grupos) {
      // altura de cada linha do grupo, e do grupo inteiro
      const medidas = grupo.map((ln) => {
        const celulas = cols.map((c, k) => quebrar(ln[k] ?? "", font, tam, c.w - 7));
        return { celulas, alt: Math.max(14, Math.max(...celulas.map((x) => x.length)) * (tam + 1.6) + 5) };
      });
      const altGrupo = medidas.reduce((t, m) => t + m.alt, 0);
      // ⚠ o grupo não se parte entre páginas: item mesclado cortado ao meio perde o número.
      if (y - altGrupo < 56) { banda(); cabec(); }

      if (zebra % 2 === 1) page.drawRectangle({ x: M, y: y - altGrupo, width: W, height: altGrupo, color: SOFT });
      zebra++;

      // as colunas mescladas (as duas primeiras) saem UMA vez, centradas na altura do grupo
      const topoGrupo = y;
      medidas.forEach((m, idx) => {
        let cx = M + 4;
        m.celulas.forEach((linhasCel, k) => {
          const mesclada = agrupar && k <= 1;
          if (mesclada && idx > 0) { cx += cols[k].w; return; }
          const yBase = mesclada && grupo.length > 1
            ? topoGrupo - (altGrupo - (linhasCel.length * (tam + 1.6))) / 2 - 8
            : y - 10;
          linhasCel.forEach((t, j) => {
            page.drawText(t, {
              x: cx + alinhar(t, cols[k], cols[k].w),
              y: yBase - j * (tam + 1.6), size: tam,
              font: k === 0 || (agrupar && k === 1) ? bold : font, color: DARK,
            });
          });
          cx += cols[k].w;
        });
        y -= m.alt;
      });
      page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.3, color: LINE });
    }
    y -= 12;
  };

  if (doc === "PIT") {
    const nomes = snapshot.snqc ? PIT_COLUNAS.snqc : PIT_COLUNAS.comum;
    // larguras proporcionais: o escopo e o critério são o que se lê; item, tipo e percentual são estreitos
    const pesos = snapshot.snqc ? [26, 120, 190, 130, 78, 110, 130, 60] : [26, 118, 196, 40, 46, 96, 202, 60];
    const soma = pesos.reduce((a, b) => a + b, 0);
    // ⚠ ITEM e o TIPO (TORG/cliente) centrados; percentual em "n" (centra só valor curto, como
    // "100%" e "10%", e deixa "VISUAL E ESPESSURA 100% · ADERÊNCIA NBR 11003" à esquerda). Vitor
    // (27/08/2026): "o % por exemplo como centralizado".
    const centro = snapshot.snqc ? { 0: "c", 4: "n" } : { 0: "c", 3: "c", 4: "c", 5: "n" };
    const cols = nomes.map((t, i) => ({ t, w: (pesos[i] / soma) * W, al: centro[i] }));
    // a coluna do percentual sai como porcentagem — a planilha do cliente guarda 1 e 0,1
    const iPct = snapshot.snqc ? 4 : 5;
    const linhasPit = (snapshot.linhas || []).map((ln) => ln.map((v, i) => (i === iPct ? pctAvaliado(v) : v)));
    secao(`Escopo de inspeção — ${snapshot.nomePadrao || ""}`);
    tabela(cols, linhasPit, { agrupar: true, gruposCabec: snapshot.snqc ? null : PIT_GRUPOS.comum });

    // ⚠⚠ A LEGENDA NÃO SE PARTE. Foi o terceiro ponto do cliente (28/08/2026): "além da Legenda
    // que contém todas as siglas presentes no documento". Ela existia, mas quebrava no meio — CT,
    // DB e RI numa folha e H, X e N.A. na outra, órfãos e sem o título em cima. Quem lê a segunda
    // folha vê três siglas soltas e conclui que a legenda está incompleta. Reserva a altura
    // inteira antes de começar: ou cabe aqui, ou vai inteira para a folha seguinte.
    const leg = [...PIT_LEGENDA, ...(snapshot.snqc ? PIT_LEGENDA_SNQC : [])];
    espaco(26 + Math.ceil(leg.length / 3) * 12 + 12);
    secao("Legenda");
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
      // ⚠ ESPESSURA SECA É UM NÚMERO SÓ. Vitor (27/08/2026): "no caso da aplicação da tinta não
      // precisa ter mínimo e máximo, apenas a espessura seca final". A faixa que faz sentido no
      // documento é a da RUGOSIDADE (perfil de jateamento, que a norma dá em faixa); a camada seca
      // é o que se especifica e o que o medidor tem de encontrar.
      d.espessuraMin != null && d.espessuraMax != null && Number(d.espessuraMax) !== Number(d.espessuraMin)
        ? `${nz(d.espessuraMin)} a ${nz(d.espessuraMax)}`
        : nz(d.espessuraMin ?? d.espessuraMax),
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
      // ⚠⚠ SEM LOTE, SEM COLUNA. Vitor (28/08/2026): "deixe o campo para preencher o lote, porém se
      // não for informado não deve aparecer no pdf o campo dele com o —". O lote só nasce na hora de
      // abrir a lata: no plano elaborado ANTES da pintura a coluna sairia inteira de travessões, e
      // travessão em documento do cliente lê como dado que faltou, não como dado que ainda não
      // existe. Com uma demão preenchida a coluna volta — e a demão sem lote fica em branco.
      const temLote = comEspec.some((d) => String(d.lote ?? "").trim());
      const colsEspec = [
        { t: "ESPECIFICAÇÃO", f: 0.15 }, { t: "PRODUTO / COMPONENTES", f: 0.26 }, { t: "FABRICANTE", f: 0.13 },
        ...(temLote ? [{ t: "LOTE / R", f: 0.1 }] : []),
        { t: "DILUIÇÃO", f: 0.12 }, { t: "CAMADA ÚMIDA (µm)", f: 0.12 },
        { t: "SECAGEM / POT LIFE", f: 0.14 },
      ];
      // a fração da coluna que saiu volta para as outras, senão a tabela encolhe no meio da folha
      const somaF = colsEspec.reduce((a, c) => a + c.f, 0);
      tabela(colsEspec.map((c) => ({ t: c.t, w: (W * c.f) / somaF })), comEspec.map((d) => [
        nz(d.nome),
        [d.produto, d.componentes].filter(Boolean).join("\n") || "—",
        nz(d.fabricante),
        ...(temLote ? [String(d.lote ?? "").trim()] : []),
        nz(d.diluicao),
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
  espaco(110); // o quadro cresce se houver carimbo — reserva pela altura máxima
  secao("Aprovações");
  const r = snapshot.responsaveis || {};
  const doCliente = (assinaturas || []).find((a) => a.assinadoEm) || (assinaturas || [])[0] || null;
  const blocos = [
    { papel: "ELABORADO POR", nome: r.elaborado?.nome, em: r.elaborado?.assinadoEm },
    { papel: "VERIFICADO POR", nome: r.verificado?.nome, em: r.verificado?.assinadoEm },
    // ⚠ antes de o cliente assinar, vale o contato CADASTRADO — o quadro sai com o nome de quem
    // vai aceitar, e não com um "—" que faz o documento parecer incompleto na verificação interna.
    { papel: "INSPETOR DO CLIENTE / QUALIDADE", nome: doCliente?.nome || r.cliente?.nome, em: doCliente?.assinadoEm || r.cliente?.assinadoEm, ip: doCliente?.ip, imagemUrl: doCliente?.imagemUrl || null },
  ];
  const larg = W / 3;
  // ⚠ o quadro cresce quando alguém assinou com carimbo (Vitor, 28/08/2026: "caso o cliente já
  // tenha cadastro ele puxa o carimbo"): a assinatura ocupa a largura da coluna, acima da linha, que
  // é onde se assina no papel. Sem carimbo, o quadro fica na altura de sempre.
  const comCarimbo = blocos.some((b) => b.imagemUrl);
  const yLinha = comCarimbo ? 76 : 40;
  const hCarimbo = 40;
  for (const [i, b] of blocos.entries()) {
    const x = M + i * larg;
    page.drawRectangle({ x, y: y - 14, width: larg - 8, height: 14, color: GRAY });
    page.drawText(san(b.papel), { x: x + 5, y: y - 10.5, size: 6.5, font: bold, color: WHITE });
    page.drawText(san(b.nome || "—"), { x: x + 5, y: y - 26, size: 9, font, color: DARK });
    if (b.imagemUrl) {
      const img = await imagemDaAssinatura(pdf, b.imagemUrl);
      if (img) {
        const esc = Math.min((larg - 16) / img.width, hCarimbo / img.height);
        const lg = img.width * esc, al = img.height * esc;
        page.drawImage(img, { x: x + (larg - 8 - lg) / 2, y: y - yLinha + 4 + (hCarimbo - al) / 2, width: lg, height: al });
      }
    }
    page.drawLine({ start: { x, y: y - yLinha }, end: { x: x + larg - 8, y: y - yLinha }, thickness: 0.8, color: LINE });
    if (b.em) {
      page.drawText(san(`Assinado em ${fmtDT(b.em)}`), { x: x + 5, y: y - yLinha - 10, size: 7, font: bold, color: GREEN });
      if (b.ip) page.drawText(san(`IP ${b.ip}`), { x: x + 5, y: y - yLinha - 19, size: 6.5, font, color: GRAY });
    } else {
      page.drawText("Data: ____ / ____ / ________", { x: x + 5, y: y - yLinha - 10, size: 7, font, color: GRAY });
    }
  }
  y -= yLinha + 28;
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
