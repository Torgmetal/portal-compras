import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { dataHoraBR } from "./data-br";

// CARIMBO DE RASTREABILIDADE no desenho impresso.
//
// Vitor (18/08/2026): "hoje basicamente pegamos o número na planilha e preenchemos no croqui à
// mão". Este carimbo tira a mão do processo: quando o desenho é emitido pelo portal, ele já sai
// com a rastreabilidade do material daquela marca, com quem imprimiu, data e hora — e o MESMO
// arquivo carimbado vai pro Data Book (fica amarrado; o papel do chão de fábrica e o do cliente
// são o mesmo byte).
//
// POSIÇÃO: no ALTO da folha. A primeira versão colocava no rodapé e tapava o CARIMBO TÉCNICO do
// desenho (responsável, material, peso, escala) — Vitor apontou em 19/08 e sugeriu a faixa de
// cima, onde ficam as tabelas "QTD. | RASTREABILIDADE MAT." que hoje são preenchidas à mão. É
// exatamente a informação que a tarja traz, então é o lugar certo.
//
// CONJUNTO traz os R das POSIÇÕES (croquis) agrupados + o R do CONSUMÍVEL DE SOLDA (o consumível
// usa o mesmo lote por semanas e muda quando entra lote novo no CMR — lib/consumivel-solda.js).
//
// O **R** é quem manda no carimbo (Vitor 18/08): é ele que puxa corrida/lote, certificado, NF e
// fornecedor, e é ele que o chão de fábrica lê. Peça ainda NÃO CORTADA sai sem R — de propósito;
// o R só é atribuído no corte, e aí o carimbo traz o campo pra anotar/validar na peça.

const NAVY = rgb(0.051, 0.122, 0.235);
const LARANJA = rgb(0.957, 0.502, 0.122);
const CINZA = rgb(0.35, 0.38, 0.42);
const PRETO = rgb(0.1, 0.1, 0.1);

// ⚠ SEMPRE via dataHoraBR: o servidor roda em UTC e o carimbo saía 3h adiantado (emitido às
// 21:48 aparecia como "19/08 00:48"). (Vitor 19/08.)
const fmtDataHora = dataHoraBR;

// A tarja tem largura fixa e o texto varia muito (uma corrida × duas candidatas × conjunto):
// encolhe até caber e, no limite, corta com reticências — nunca deixa vazar pra fora da folha.
// Helvetica (base-14) só escreve WinAnsi/CP1252 e pdf-lib LEVANTA ERRO num caractere de fora —
// um "⚠" no meio do texto derrubava a emissão inteira do desenho. Nome de material vem de
// planilha e traz o que quiser (símbolo, acento exótico, emoji), então sanear é obrigatório:
// nenhum desenho pode deixar de ser emitido por causa de um caractere.
const ACENTO_FORA = { "⚠": "!", "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "×": "x", "•": "·", "™": "TM", "≠": "!=" };
function winAnsi(t) {
  return String(t ?? "").replace(/[^\x00-\xFF]/gu, (c) => {
    if (ACENTO_FORA[c]) return ACENTO_FORA[c];
    if ("‘’‚‛".includes(c)) return "'";
    if ("“”„".includes(c)) return '"';
    if ("–—―".includes(c)) return "-";
    if (c === "…") return "...";
    // tira acento que o CP1252 não tem (ā, ș…) e, se sobrar coisa nenhuma, some com o caractere
    const base = c.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return /^[\x00-\xFF]*$/.test(base) ? base : "";
  });
}

function caber(texto, maxW, font, size, min = 5.5) {
  let s = winAnsi(texto), sz = size;
  while (sz > min && font.widthOfTextAtSize(s, sz) > maxW) sz -= 0.25;
  if (font.widthOfTextAtSize(s, sz) > maxW) {
    while (s.length > 4 && font.widthOfTextAtSize(s + "…", sz) > maxW) s = s.slice(0, -1);
    s += "…";
  }
  return { s, sz };
}

// Coordenadas VISUAIS (o que a pessoa vê) → coordenadas da página, respeitando o /Rotate do PDF.
// Desenho de engenharia vem em A1/A2 e às vezes com rotação — sem isto o carimbo cai de lado ou
// fora da folha.
function projetor(page) {
  const { width: w, height: h } = page.getSize();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  if (rot === 90) return { W: h, H: w, map: (dx, dy) => ({ x: w - dy, y: dx }), ang: 90 };
  if (rot === 180) return { W: w, H: h, map: (dx, dy) => ({ x: w - dx, y: h - dy }), ang: 180 };
  if (rot === 270) return { W: h, H: w, map: (dx, dy) => ({ x: dy, y: h - dx }), ang: 270 };
  return { W: w, H: h, map: (dx, dy) => ({ x: dx, y: dy }), ang: 0 };
}

// Uma linha de rastreabilidade por peça, já no texto que vai pro papel.
function linhaRastreio(it) {
  const u = it?.usadas?.[0];
  const rs = [...new Set((it?.candidatas || []).map((c) => c.rastreio).filter(Boolean))];
  switch (it?.situacao) {
    case "R_DEFINIDO":
      return {
        forte: `R ${u?.rastreio || "—"}${u?.corrida ? `  ·  corrida ${u.corrida}` : "  ·  corrida não lançada no CMR"}`,
        fraco: [u?.certificado ? `cert. ${u.certificado}` : null, u?.material || null, u?.fornecedor || null,
          it.criterio === "fifo" ? "atribuído por FIFO (entrega mais antiga disponível no corte)" : null].filter(Boolean).join("  ·  "),
        anotar: false,
      };
    case "AGUARDANDO_CORTE":
      return {
        forte: "R A DEFINIR NO CORTE — peça ainda em aberto",
        fraco: rs.length ? `material desta OP no CMR: ${rs.map((r) => `R ${r}`).join("  ·  ")}` : "",
        anotar: true,
      };
    case "ESTOQUE":
      return { forte: `MATERIAL DE ESTOQUE — cortada antes de qualquer entrega desta OP${rs.length ? ` (entradas da OP: ${rs.map((r) => `R ${r}`).join(", ")})` : ""}`, fraco: "", anotar: true };
    default:
      return { forte: "SEM MATERIAL lançado no CMR desta OP", fraco: "", anotar: true };
  }
}

// Uma linha por POSIÇÃO do conjunto, na mesma leitura da LISTA DE MATERIAIS do desenho — com a
// coluna que falta nela: o R (e a corrida, e o certificado). Vitor (19/08): "no caso dos conjuntos
// você deve listar os materiais que compõem o conjunto que estão na LPC e na tabela ao lado dos
// conjuntos, e mais o R do arame que foi usado".
//
// ⚠ QTD é `qtdNoConjunto`, quantas vezes a posição entra NESTE conjunto — `qte` é o total da peça
// na OP inteira e dava P8 = 87 onde o desenho do T83D32 diz 6.
function linhasDoConjunto(itens) {
  return itens.map((it) => {
    const u = it.usadas?.[0];
    return {
      pos: it.marca || "—",
      qtd: it.qtdNoConjunto != null ? String(it.qtdNoConjunto) : it.qte != null ? String(it.qte) : "",
      desc: it.perfil || it.material || it.descricao || "",
      r: u?.rastreio ? `R ${u.rastreio}` : "a definir no corte",
      corrida: u?.corrida || (u?.rastreio ? "corrida não lançada" : ""),
      cert: u?.certificado || "",
      pend: !u?.rastreio,
    };
  });
}

const A4_PAISAGEM = [842, 595];
const LINHAS_POR_FOLHA = 36;

/**
 * FOLHA ANEXA de rastreabilidade — só para CONJUNTO. Sai em A4 paisagem, à parte do desenho:
 * a tabela cresce com o nº de posições (36 no T60B20) e não existe área da folha que ela não
 * cubra. Vitor (19/08): "o carimbo no conjunto está cobrindo informações importantes do projeto".
 *
 * A4 sempre, escolha do Vitor: na emissão em lote ela cai no arquivo A4 que já existe e os A1
 * continuam limpos numa bandeja só.
 *
 * @returns {Promise<Uint8Array|null>} null quando não é conjunto (croqui/avulsa não têm posições)
 */
export async function folhaRastreabilidade(info) {
  const itens = info.itens || [];
  if (itens.length < 2) return null;
  const linhas = linhasDoConjunto(itens);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const quando = info.quando || new Date();
  const cs = info.consumivel;
  const pend = linhas.filter((l) => l.pend).length;
  const nFolhas = Math.max(1, Math.ceil(linhas.length / LINHAS_POR_FOLHA));

  const COLS = [
    { k: "pos", t: "POS.", x: 30, w: 100 },
    { k: "qtd", t: "QTD.", x: 135, w: 30 },
    { k: "desc", t: "DESCRIÇÃO", x: 172, w: 150 },
    { k: "r", t: "RASTREABILIDADE (R)", x: 330, w: 120 },
    { k: "corrida", t: "CORRIDA", x: 458, w: 150 },
    { k: "cert", t: "CERTIFICADO", x: 616, w: 196 },
  ];

  for (let f = 0; f < nFolhas; f++) {
    const [W, H] = A4_PAISAGEM;
    const page = pdf.addPage([W, H]);
    const txt = (x, y, t, { size = 8, ft = font, cor = PRETO, max = null } = {}) => {
      if (!t) return;
      const { s: t2, sz } = caber(t, max ?? W - x - 24, ft, size, 5);
      page.drawText(t2, { x, y, size: sz, font: ft, color: cor });
    };

    page.drawRectangle({ x: 0, y: H - 52, width: W, height: 52, color: NAVY });
    page.drawRectangle({ x: 0, y: H - 56, width: W, height: 4, color: LARANJA });
    txt(30, H - 28, `TORG · OP-${info.opNumero} · ${info.marca}`, { size: 15, ft: bold, cor: rgb(1, 1, 1) });
    txt(30, H - 44, `RASTREABILIDADE DO MATERIAL POR POSIÇÃO — ${linhas.length} posições${pend ? ` · ${pend} a definir no corte` : " · todas rastreadas"}`,
      { size: 8, ft: bold, cor: rgb(0.78, 0.85, 0.95) });

    const yCab = H - 78;
    for (const c of COLS) txt(c.x, yCab, c.t, { size: 6.5, ft: bold, cor: CINZA, max: c.w });
    page.drawRectangle({ x: 30, y: yCab - 4, width: W - 60, height: 0.7, color: CINZA });

    const fatia = linhas.slice(f * LINHAS_POR_FOLHA, (f + 1) * LINHAS_POR_FOLHA);
    fatia.forEach((ln, i) => {
      const y = yCab - 15 - i * 11;
      if (i % 2 === 1) page.drawRectangle({ x: 30, y: y - 3, width: W - 60, height: 10.5, color: rgb(0.96, 0.97, 0.99) });
      for (const c of COLS) {
        const marcar = ln.pend && (c.k === "r" || c.k === "corrida");
        txt(c.x, y, ln[c.k], { size: 7.5, ft: c.k === "r" ? bold : font, cor: marcar ? LARANJA : c.k === "r" ? NAVY : PRETO, max: c.w });
      }
    });

    let yPe = yCab - 15 - fatia.length * 11 - 16;
    if (f === nFolhas - 1) {
      if (cs) {
        txt(30, yPe, `CONSUMÍVEL DE SOLDA:  R ${cs.rastreio || "—"}${cs.lote ? `  ·  lote ${cs.lote}` : ""}${cs.certificado && cs.certificado !== cs.lote ? `  ·  cert. ${cs.certificado}` : ""}  ·  ${cs.material || ""}`,
          { size: 8.5, ft: bold, cor: NAVY });
        yPe -= 12;
      }
      if (cs?.janela) {
        txt(30, yPe, `ATENÇÃO: durante a solda ${cs.janela.length === 1 ? `entrou o R ${cs.janela[0].rastreio}` : `entraram ${cs.janela.length} lotes (R ${cs.janela.map((j) => j.rastreio).join(", R ")})`} — anotar qual foi usado`,
          { size: 7.5, ft: bold, cor: LARANJA });
      }
    }

    page.drawRectangle({ x: 0, y: 26, width: W, height: 0.7, color: CINZA });
    txt(30, 14, `Emitido por ${info.usuario || "—"} em ${fmtDataHora(quando)}${info.setor ? ` · setor ${info.setor}` : ""}${info.grdId ? ` · GRD ${String(info.grdId).slice(-8).toUpperCase()}` : ""} · anexo do desenho ${info.arquivo || info.marca} · documento controlado`,
      { size: 6.5, cor: CINZA, max: W - 130 });
    txt(W - 90, 14, `folha ${f + 1} de ${nFolhas}`, { size: 6.5, ft: bold, cor: CINZA, max: 70 });
  }
  return pdf.save();
}

/**
 * @param {Buffer|Uint8Array} pdfBytes  PDF original do SharePoint
 * @param {object} info { opNumero, marca, descricao, setor, formato, arquivo, usuario, quando, grdId, itens }
 *        itens = saída de rastreioDoConjunto (1 linha p/ peça; N p/ conjunto)
 * @returns {Promise<Uint8Array>} PDF carimbado
 */
export async function carimbarDesenho(pdfBytes, info) {
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const quando = info.quando || new Date();
  const itens = info.itens || [];

  // Uma peça (croqui/avulsa) → rastreabilidade cheia. Conjunto → resumo das posições, porque a
  // lista completa não cabe na tarja (ela sai na §02 do Data Book e no portal).
  let l1, l2, anotar = false, tabela = null;
  if (itens.length === 1) {
    const r = linhaRastreio(itens[0]);
    l1 = r.forte; l2 = r.fraco; anotar = r.anotar;
  } else if (itens.length > 1) {
    // CONJUNTO: uma LINHA POR POSIÇÃO, espelhando a LISTA DE MATERIAIS do próprio desenho e
    // acrescentando o que falta nela — o R e a corrida de cada posição. Vitor (19/08): "no caso
    // dos conjuntos você deve listar os materiais que compõem o conjunto que estão na LPC e na
    // tabela ao lado dos conjuntos, e mais o R do arame que foi usado".
    //
    // Antes era um resumo agrupado por R ("R 260743 (1 pç) · R 260765 (2 pç)…") que não dizia
    // QUAL posição levou qual R e ainda era cortado pela largura da tarja.
    tabela = linhasDoConjunto(itens);
    const pend = tabela.filter((l) => l.pend).length;
    // ⚠ A TABELA NÃO VAI NO DESENHO. Vitor (19/08): "o carimbo no conjunto está cobrindo
    // informações importantes do projeto, e o conjunto é complicado pois temos vários pontos" —
    // o T60B20 tem 36 posições e a tarja comia um terço da folha. No desenho fica só a faixa
    // fina; a tabela sai em FOLHA A4 ANEXA (folhaRastreabilidade), que serve pra 8 ou pra 80
    // posições sem nunca cobrir nada.
    l1 = `${itens.length} posições · ${itens.length - pend} com R${pend ? ` · ${pend} a definir no corte` : ""}`;
    l2 = "detalhe posição a posição na FOLHA ANEXA desta emissão";
    // sem campo de preencher à mão no conjunto: a folha anexa traz o R por posição (Vitor riscou
    // os campos "Nº R do material usado / Corrida / Visto" no carimbo da OP-083).
    anotar = false;
  } else {
    l1 = "SEM MATERIAL lançado no CMR desta OP";
    l2 = ""; anotar = true;
  }

  // Consumível de solda: mesmo lote por semanas, muda quando entra lote novo no CMR.
  const cs = info.consumivel;
  // ⚠ O lote vale pela data do APONTAMENTO da solda, não pela data da emissão (Vitor 19/08):
  // reemitir hoje o desenho de um conjunto soldado em julho tem de sair com o arame de julho.
  // Ainda não soldado → `cs` vem null e a linha não sai: previsão não é registro.
  // Só sai quando a peça FOI soldada — lote previsto não entra no carimbo (Vitor 19/08:
  // "apenas a rastreabilidade que de fato foi usado").
  const linhaConsumivel = cs
    ? `CONSUMÍVEL DE SOLDA:  R ${cs.rastreio || "—"}${cs.lote ? `  ·  lote ${cs.lote}` : ""}${cs.certificado && cs.certificado !== cs.lote ? `  ·  cert. ${cs.certificado}` : ""}  ·  ${cs.material || ""}`
    : null;
  // O aviso de troca de lote vai em LINHA PRÓPRIA: emendado no fim da linha do consumível ele era
  // a primeira coisa a ser cortada pelo `caber()` — some justamente o que precisa ser lido.
  const linhaJanela = cs?.janela
    ? `ATENÇÃO: durante a solda ${cs.janela.length === 1 ? `entrou o R ${cs.janela[0].rastreio}` : `entraram ${cs.janela.length} lotes (R ${cs.janela.map((j) => j.rastreio).join(", R ")})`} — anotar qual foi usado`
    : null;

  const rodape = `Emitido por ${info.usuario || "—"} em ${fmtDataHora(quando)}${info.setor ? ` · setor ${info.setor}` : ""}${info.grdId ? ` · GRD ${String(info.grdId).slice(-8).toUpperCase()}` : ""} · documento controlado, conferir a validade no portal`;
  const titulo = `TORG · OP-${info.opNumero} · ${info.marca}${info.formato ? ` · ${info.formato}` : ""}`;
  // O rótulo fala "R" porque é assim que o chão de fábrica chama — o R puxa o resto.

  for (const page of pdf.getPages()) {
    const { W, H, map, ang } = projetor(page);
    // A tarja acompanha o TAMANHO DA FOLHA: num A1 (84 cm) o corpo de 8,5 pt some, num A4 fica
    // certo. Escala pela largura visual, com teto pra não virar cartaz.
    const k = Math.max(1, Math.min(2.4, W / 850));
    const alt = Math.round(((anotar ? 74 : 60) + (linhaConsumivel ? 12 : 0) + (linhaJanela ? 11 : 0)) * k);
    const m = Math.round(10 * k);
    // NÃO ocupa a folha toda: para antes do bloco "LIBERADO P/ FABRICAÇÃO" (que fica no canto
    // superior direito dos desenhos da Torg). Sobra em cima das tabelas "QTD. | RASTREABILIDADE
    // MAT." — que são exatamente o que a tarja preenche. (Vitor 19/08.)
    const larg = Math.max(Math.round(W * 0.66) - m, Math.min(W - m * 2, Math.round(380 * k)));

    // tarja branca com filete laranja (padrão Torg) no ALTO da folha (base = H - alt - m)
    const y0 = H - alt - m;
    const cantos = [map(m, y0), map(m + larg, y0), map(m + larg, y0 + alt), map(m, y0 + alt)];
    const xs = cantos.map((p) => p.x), ys = cantos.map((p) => p.y);
    page.drawRectangle({
      x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
      color: rgb(1, 1, 1), borderColor: NAVY, borderWidth: 1.2,
    });

    // filete laranja na base da tarja (separa do desenho)
    const fil = Math.max(3, Math.round(3 * k));
    const fx = [map(m, y0), map(m + larg, y0), map(m + larg, y0 + fil), map(m, y0 + fil)];
    page.drawRectangle({
      x: Math.min(...fx.map((p) => p.x)), y: Math.min(...fx.map((p) => p.y)),
      width: Math.abs(Math.max(...fx.map((p) => p.x)) - Math.min(...fx.map((p) => p.x))) || fil,
      height: Math.abs(Math.max(...fx.map((p) => p.y)) - Math.min(...fx.map((p) => p.y))) || fil,
      color: LARANJA,
    });

    // texto: escrito nas coordenadas visuais, girado junto com a página e sempre dentro da tarja
    const txt = (dx, dy, s, { size = 8, f = font, cor = PRETO, max = null } = {}) => {
      if (!s) return;
      const limite = max != null ? max : larg - (dx - m) - 8;
      const { s: txt2, sz } = caber(s, limite, f, size, 5.5 * k);
      const p = map(dx, dy);
      page.drawText(txt2, { x: p.x, y: p.y, size: sz, font: f, color: cor, rotate: degrees(ang) });
    };
    const colRastreio = Math.min(175 * k, larg * 0.30); // a coluna do rótulo encolhe em folha pequena
    const y = y0 + alt - 14 * k;
    txt(m + 8 * k, y, titulo, { size: 9 * k, f: bold, cor: NAVY, max: colRastreio - 10 * k });
    // No conjunto o rótulo sai da esquerda (a tabela ocupa a largura toda e ele colidia com a
    // coluna POS.) e vira o subtítulo, junto da contagem de posições.
    txt(m + 8 * k, y - 13 * k, "RASTREABILIDADE (R) DO MATERIAL", { size: 6.5 * k, f: bold, cor: CINZA, max: colRastreio - 10 * k });
    txt(m + colRastreio, y - 12 * k, l1, { size: 8.5 * k, f: bold, cor: PRETO });
    if (l2) txt(m + colRastreio, y - 23 * k, l2, { size: 7 * k, cor: tabela ? NAVY : CINZA, f: tabela ? bold : font });
    let yAtual = y - 23 * k;
    const xInfo = m + colRastreio;
    if (linhaConsumivel) { yAtual -= 11 * k; txt(xInfo, yAtual, linhaConsumivel, { size: 7.5 * k, f: bold, cor: NAVY }); }
    if (linhaJanela) { yAtual -= 10 * k; txt(xInfo, yAtual, linhaJanela, { size: 7 * k, f: bold, cor: LARANJA }); }
    if (anotar) txt(m + 8 * k, yAtual - 15 * k, "Nº R do material usado: ____________________   Corrida: ____________________   Visto: __________", { size: 7.5 * k, f: bold, cor: PRETO });
    // rodapé com folga acima do filete laranja (antes encostava nele)
    txt(m + 8 * k, y0 + fil + 5 * k, rodape, { size: 6.5 * k, cor: CINZA });
  }

  pdf.setTitle(`${info.marca} — OP-${info.opNumero} (rastreado)`);
  pdf.setSubject(`Desenho emitido com rastreabilidade de material · ${fmtDataHora(quando)}`);
  pdf.setProducer("Portal Torg Metal");
  return pdf.save();
}

/**
 * Desenho carimbado + FOLHA ANEXA de rastreabilidade num arquivo só. É o que a emissão avulsa
 * entrega: o usuário abre um PDF e tem o desenho e, atrás, a tabela por posição.
 *
 * ⚠ A emissão em LOTE **não** usa isto — lá o anexo A4 tem de ir pro arquivo A4, senão ele entra
 * no meio dos A1 e o lote vira mistura de formatos (que é justamente o que não pode ir pra
 * impressora). Ver `emitirLoteDesenhos`.
 */
export async function carimbarComAnexo(pdfBytes, info) {
  const principal = await carimbarDesenho(pdfBytes, info);
  const anexo = await folhaRastreabilidade(info);
  if (!anexo) return principal;
  const doc = await PDFDocument.load(principal, { ignoreEncryption: true });
  const an = await PDFDocument.load(anexo);
  for (const pg of await doc.copyPages(an, an.getPageIndices())) doc.addPage(pg);
  return doc.save();
}
