import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { dataHoraBR } from "./data-br";
import { acharCampoConsumivel, acharCamposRastreabilidade, acharMoldura } from "./campos-desenho";

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
  let l1, l2, anotar = false, ehConjunto = false;
  if (itens.length === 1) {
    const r = linhaRastreio(itens[0]);
    l1 = r.forte; l2 = r.fraco; anotar = r.anotar;
  } else if (itens.length > 1) {
    // CONJUNTO: NÃO leva a rastreabilidade das posições. Vitor (19/08): "vamos tirar a ideia de
    // colocarmos as rastreabilidades de todos os croquis no conjunto; no próprio canto do conjunto
    // temos um espaço para informar a rastreabilidade do consumível, ali já basta — só fazer o
    // controle da emissão e impressão dos conjuntos... as demais informações dos demais carimbos
    // não precisa".
    //
    // Faz sentido: o R do MATERIAL pertence ao croqui (é lá que a barra é cortada) e já sai no
    // carimbo dele; o R do ARAME pertence ao conjunto, e o desenho já tem campo próprio pra ele
    // (`SOLDADOR | SINETE | CONSUMÍVEL`) — a emissão PREENCHE esse campo em vez de carimbar por
    // cima do projeto. Aqui fica só a prova de emissão.
    ehConjunto = true;
    l1 = null; l2 = null; anotar = false;
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
  // No CONJUNTO o R do arame vai pro campo CONSUMÍVEL do próprio desenho (abaixo) — na tarja ele
  // só aparece se o desenho não tiver o campo, pra informação não sumir.
  const campos = ehConjunto && cs ? await acharCampoConsumivel(pdfBytes).catch(() => []) : [];

  // CROQUI: a tabela `QTD. | RASTREABILIDADE MAT.` do próprio desenho é o campo do R — é ela que o
  // corte preenche à mão hoje. A emissão escreve nela. Enquanto a tarja tapava essa tabela e ainda
  // oferecia "Nº R do material usado: ____", que é a MESMA coisa duplicada por cima.
  // (Vitor 19/08: "o carimbo ainda está saindo errado no croqui".)
  const usadas = !ehConjunto && itens.length === 1 ? (itens[0]?.usadas || []).filter((u) => u?.rastreio) : [];
  const camposR = !ehConjunto ? await acharCamposRastreabilidade(pdfBytes).catch(() => []) : [];
  // com a tabela no desenho a tarja encolhe pra uma linha, igual à do conjunto — mesmo sem R
  // definido, porque o espaço pra anotar à mão é a tabela, não a tarja.
  const soEmissao = ehConjunto || camposR.length > 0;
  // A tarja de uma linha vai pra MARGEM DE BAIXO, alinhada à moldura. Vitor (19/08): "alinhe ele
  // para ficar na margem correta, e acredito ser melhor ele ficar na margem de baixo, pois em cima
  // ficou poluído" — no alto ela caía sobre a legenda de simbologia e ainda começava fora da
  // moldura, desalinhada de tudo. Sem moldura reconhecível, cai no topo como antes.
  const molduras = soEmissao ? await acharMoldura(pdfBytes).catch(() => new Map()) : new Map();
  if (camposR.length) anotar = false;

  const linhaConsumivel = cs && (!ehConjunto || !campos.length)
    ? `CONSUMÍVEL DE SOLDA:  R ${cs.rastreio || "—"}${cs.lote ? `  ·  lote ${cs.lote}` : ""}${cs.certificado && cs.certificado !== cs.lote ? `  ·  cert. ${cs.certificado}` : ""}  ·  ${cs.material || ""}`
    : null;
  // O aviso de troca de lote vai em LINHA PRÓPRIA: emendado no fim da linha do consumível ele era
  // a primeira coisa a ser cortada pelo `caber()` — some justamente o que precisa ser lido.
  const linhaJanela = cs?.janela
    ? `ATENÇÃO: durante a solda ${cs.janela.length === 1 ? `entrou o R ${cs.janela[0].rastreio}` : `entraram ${cs.janela.length} lotes (R ${cs.janela.map((j) => j.rastreio).join(", R ")})`} — anotar qual foi usado`
    : null;

  const emissao = `Emitido por ${info.usuario || "—"} em ${fmtDataHora(quando)}${info.setor ? ` · setor ${info.setor}` : ""}${info.grdId ? ` · GRD ${String(info.grdId).slice(-8).toUpperCase()}` : ""}`;
  const rodape = `${emissao} · documento controlado, conferir a validade no portal`;
  // na linha única do conjunto o "conferir a validade no portal" era o pedaço que o caber()
  // cortava — sai fora, o que precisa provar a emissão é quem/quando/GRD
  const rodapeCurto = `${emissao} · documento controlado`;
  // a tabela do desenho fica em branco pro corte anotar — a tarja só avisa que é o caso
  const avisoR = camposR.length && !usadas.length ? "  ·  R A DEFINIR NO CORTE" : "";
  const titulo = `TORG · OP-${info.opNumero} · ${info.marca}${info.formato ? ` · ${info.formato}` : ""}`;
  // O rótulo fala "R" porque é assim que o chão de fábrica chama — o R puxa o resto.

  pdf.getPages().forEach((page, iPg) => {
    const mold = molduras.get(iPg + 1);
    if (mold) {
      // FAIXA NA MARGEM: coordenadas do conteúdo da página (sem projetor) — o texto gira junto com
      // a folha, como o resto do desenho.
      //
      // Onde exatamente: primeiro tenta a faixa ENTRE as molduras, abaixo do "FORMATO A3 …" que o
      // desenho já escreve lá. Quando sobra pouco (o croqui A4 tem 6,5 pt), desce pra margem do
      // PAPEL, abaixo da moldura externa — lá o mesmo croqui tem 62 pt de folga. Sem espaço em
      // nenhum dos dois, volta pra tarja de cima.
      const folgaFaixa = mold.yTextoMin - mold.yBase - 2;
      const noPapel = folgaFaixa < 10 && mold.yBase >= 16;
      if (folgaFaixa < 10 && !noPapel) return desenharTarjaTopo(page);
      const alt = noPapel ? 12 : Math.min(12, folgaFaixa);
      const yTexto = noPapel ? mold.yBase - alt : mold.yBase + 2.5;
      const largMax = mold.x1 - mold.x0;
      const escreve = (x, t, { size, f, cor }) => {
        const { s: t2, sz } = caber(t, largMax - (x - mold.x0) - 4, f, size, 4.5);
        page.drawText(t2, { x, y: yTexto, size: sz, font: f, color: cor });
        return f.widthOfTextAtSize(t2, sz);
      };
      const szTit = Math.max(5.2, Math.min(8.5, alt * 0.68));
      const w = escreve(mold.x0 + 2, titulo, { size: szTit, f: bold, cor: NAVY });
      escreve(mold.x0 + 2 + w + 8, `— ${rodapeCurto}${avisoR}`, { size: szTit * 0.82, f: font, cor: CINZA });
      // filete laranja rente à moldura, pra ler como parte do documento
      page.drawRectangle({ x: mold.x0, y: (noPapel ? mold.yBase - 2.2 : mold.yTopo - 1.6), width: largMax, height: 1.6, color: LARANJA });
      return;
    }
    desenharTarjaTopo(page);
  });

  function desenharTarjaTopo(page) {
    const { W, H, map, ang } = projetor(page);
    // A tarja acompanha o TAMANHO DA FOLHA: num A1 (84 cm) o corpo de 8,5 pt some, num A4 fica
    // certo. Escala pela largura visual, com teto pra não virar cartaz.
    const k = Math.max(1, Math.min(2.4, W / 850));
    // Conjunto = só prova de emissão, numa TARJA DE UMA LINHA. Sobrando só quem emitiu e quando,
    // duas linhas já eram desperdício: a faixa fina passa rente ao topo e sobra na margem da
    // folha, em vez de sentar em cima da legenda. (Vitor 19/08: "o carimbo no conjunto está
    // cobrindo informações importantes do projeto".)
    const alt = Math.round((soEmissao
      ? 17 + (linhaConsumivel ? 11 : 0) + (linhaJanela ? 10 : 0)
      : (anotar ? 74 : 60) + (linhaConsumivel ? 12 : 0) + (linhaJanela ? 11 : 0)) * k);
    const m = Math.round(10 * k);
    // NÃO ocupa a folha toda: para antes do bloco "LIBERADO P/ FABRICAÇÃO" (que fica no canto
    // superior direito dos desenhos da Torg). Sobra em cima das tabelas "QTD. | RASTREABILIDADE
    // MAT." — que são exatamente o que a tarja preenche. (Vitor 19/08.)
    const largCheia = Math.max(Math.round(W * 0.66) - m, Math.min(W - m * 2, Math.round(380 * k)));
    // no conjunto a tarja é uma linha só — a largura sai do texto, não de uma fração da folha
    // com o aviso do R a linha fica mais longa e o caber() comia justamente o aviso
    const larg = soEmissao ? Math.min(largCheia, Math.round((avisoR ? 440 : 360) * k)) : largCheia;

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
    let yAtual = y - 23 * k;
    const xInfo = m + colRastreio;
    if (soEmissao) {
      // uma linha: identificação + quem emitiu, tudo junto
      const larguraTit = bold.widthOfTextAtSize(winAnsi(titulo), 7.5 * k);
      txt(m + 6 * k, y0 + fil + 4.5 * k, titulo, { size: 7.5 * k, f: bold, cor: NAVY, max: larg * 0.42 });
      txt(m + 6 * k + Math.min(larguraTit, larg * 0.42) + 6 * k, y0 + fil + 4.5 * k, `— ${rodapeCurto}${avisoR}`,
        { size: 6.2 * k, cor: CINZA, max: larg - Math.min(larguraTit, larg * 0.42) - 18 * k });
      yAtual = y0 + fil + 4.5 * k;
    } else {
      txt(m + 8 * k, y, titulo, { size: 9 * k, f: bold, cor: NAVY, max: colRastreio - 10 * k });
      txt(m + 8 * k, y - 13 * k, "RASTREABILIDADE (R) DO MATERIAL", { size: 6.5 * k, f: bold, cor: CINZA, max: colRastreio - 10 * k });
      txt(m + colRastreio, y - 12 * k, l1, { size: 8.5 * k, f: bold, cor: PRETO });
      if (l2) txt(m + colRastreio, y - 23 * k, l2, { size: 7 * k, cor: CINZA });
    }
    if (linhaConsumivel) { yAtual -= 11 * k; txt(soEmissao ? m + 8 * k : xInfo, yAtual, linhaConsumivel, { size: 7.5 * k, f: bold, cor: NAVY }); }
    if (linhaJanela) { yAtual -= 10 * k; txt(soEmissao ? m + 8 * k : xInfo, yAtual, linhaJanela, { size: 7 * k, f: bold, cor: LARANJA }); }
    if (anotar) txt(m + 8 * k, yAtual - 15 * k, "Nº R do material usado: ____________________   Corrida: ____________________   Visto: __________", { size: 7.5 * k, f: bold, cor: PRETO });
    // rodapé com folga acima do filete laranja (antes encostava nele)
    if (!soEmissao) txt(m + 8 * k, y0 + fil + 5 * k, rodape, { size: 6.5 * k, cor: CINZA });
  }

  // PREENCHE O CAMPO "CONSUMÍVEL" do próprio desenho com o R do arame — é onde o soldador já
  // procura, e não tapa nada do projeto. As coordenadas vêm do conteúdo da página (espaço do
  // usuário), então o texto gira junto com a folha como o resto do desenho: sem `rotate` aqui.
  // CROQUI: uma linha da tabela por R usado. QTD só sai quando há UM R — com mais de um não dá pra
  // saber quantas peças vieram de cada corrida, e inventar isso é o "provável" que não entra em
  // documento de auditoria; a coluna fica em branco pro corte preencher.
  for (let i = 0; i < usadas.length && i < camposR.length; i++) {
    const c = camposR[i];
    const page = pdf.getPage(c.pagina - 1);
    if (!page) continue;
    const escreve = (cel, valor) => {
      if (!cel || !valor) return;
      const { s: t2, sz } = caber(String(valor), cel.larg, bold, Math.min(8, cel.alt * 0.55), 4);
      page.drawText(t2, { x: cel.x - bold.widthOfTextAtSize(t2, sz) / 2, y: cel.y - sz * 0.35, size: sz, font: bold, color: NAVY });
    };
    escreve(c.rastreio, usadas[i].rastreio);
    if (usadas.length === 1) escreve(c.qtd, itens[0]?.qte != null ? String(itens[0].qte) : null);
  }

  for (const c of campos) {
    const page = pdf.getPage(c.pagina - 1);
    if (!page) continue;
    const alvo = `R ${cs.rastreio || "—"}`;
    const { s: escrito, sz } = caber(alvo, c.larg, bold, Math.min(8, c.alt * 0.55), 4);
    page.drawText(escrito, {
      x: c.x - bold.widthOfTextAtSize(escrito, sz) / 2,
      y: c.y - sz * 0.35,
      size: sz, font: bold, color: NAVY,
    });
  }

  pdf.setTitle(`${info.marca} — OP-${info.opNumero} (rastreado)`);
  pdf.setSubject(`Desenho emitido com rastreabilidade de material · ${fmtDataHora(quando)}`);
  pdf.setProducer("Portal Torg Metal");
  return pdf.save();
}
