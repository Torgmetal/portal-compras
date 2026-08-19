import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

// CARIMBO DE RASTREABILIDADE no desenho impresso.
//
// Vitor (18/08/2026): "hoje basicamente pegamos o número na planilha e preenchemos no croqui à
// mão". Este carimbo tira a mão do processo: quando o desenho é emitido pelo portal, ele já sai
// com a rastreabilidade do material daquela marca, com quem imprimiu, data e hora — e o MESMO
// arquivo carimbado vai pro Data Book (fica amarrado; o papel do chão de fábrica e o do cliente
// são o mesmo byte).
//
// O **R** é quem manda no carimbo (Vitor 18/08): é ele que puxa corrida/lote, certificado, NF e
// fornecedor, e é ele que o chão de fábrica lê. Peça ainda NÃO CORTADA sai sem R — de propósito;
// o R só é atribuído no corte, e aí o carimbo traz o campo pra anotar/validar na peça.

const NAVY = rgb(0.051, 0.122, 0.235);
const LARANJA = rgb(0.957, 0.502, 0.122);
const CINZA = rgb(0.35, 0.38, 0.42);
const PRETO = rgb(0.1, 0.1, 0.1);

const fmtDataHora = (d) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");

// A tarja tem largura fixa e o texto varia muito (uma corrida × duas candidatas × conjunto):
// encolhe até caber e, no limite, corta com reticências — nunca deixa vazar pra fora da folha.
function caber(texto, maxW, font, size, min = 5.5) {
  let s = String(texto || ""), sz = size;
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
  let l1, l2, anotar = false;
  if (itens.length === 1) {
    const r = linhaRastreio(itens[0]);
    l1 = r.forte; l2 = r.fraco; anotar = r.anotar;
  } else if (itens.length > 1) {
    const c = {};
    for (const it of itens) c[it.situacao] = (c[it.situacao] || 0) + 1;
    const comR = c.R_DEFINIDO || 0;
    const pend = itens.length - comR;
    l1 = `CONJUNTO — ${itens.length} posições · ${comR} com R definido${pend ? ` · ${pend} a definir no corte` : ""}`;
    l2 = itens.filter((it) => it.situacao === "R_DEFINIDO").slice(0, 4)
      .map((it) => `${it.marca}: R ${it.usadas?.[0]?.rastreio || "—"}`).join("  ·  ") + (comR > 4 ? "  ·  …" : "");
    anotar = pend > 0;
  } else {
    l1 = "SEM MATERIAL lançado no CMR desta OP";
    l2 = ""; anotar = true;
  }

  const rodape = `Emitido por ${info.usuario || "—"} em ${fmtDataHora(quando)}${info.setor ? ` · setor ${info.setor}` : ""}${info.grdId ? ` · GRD ${String(info.grdId).slice(-8).toUpperCase()}` : ""} · documento controlado, conferir a validade no portal`;
  const titulo = `TORG · OP-${info.opNumero} · ${info.marca}${info.formato ? ` · ${info.formato}` : ""}`;
  // O rótulo fala "R" porque é assim que o chão de fábrica chama — o R puxa o resto.

  for (const page of pdf.getPages()) {
    const { W, H, map, ang } = projetor(page);
    // A tarja acompanha o TAMANHO DA FOLHA: num A1 (84 cm) o corpo de 8,5 pt some, num A4 fica
    // certo. Escala pela largura visual, com teto pra não virar cartaz.
    const k = Math.max(1, Math.min(2.4, W / 850));
    const alt = Math.round((anotar ? 66 : 52) * k);
    const m = Math.round(10 * k);
    const larg = W - m * 2;

    // tarja branca com filete laranja (padrão Torg) na base visual da folha
    const cantos = [map(m, m), map(m + larg, m), map(m + larg, m + alt), map(m, m + alt)];
    const xs = cantos.map((p) => p.x), ys = cantos.map((p) => p.y);
    page.drawRectangle({
      x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
      color: rgb(1, 1, 1), borderColor: NAVY, borderWidth: 1, opacity: 0.97,
    });

    // texto: escrito nas coordenadas visuais, girado junto com a página e sempre dentro da tarja
    const txt = (dx, dy, s, { size = 8, f = font, cor = PRETO, max = null } = {}) => {
      if (!s) return;
      const limite = max != null ? max : larg - (dx - m) - 8;
      const { s: txt2, sz } = caber(s, limite, f, size, 5.5 * k);
      const p = map(dx, dy);
      page.drawText(txt2, { x: p.x, y: p.y, size: sz, font: f, color: cor, rotate: degrees(ang) });
    };
    // filete laranja
    const fil = Math.max(3, Math.round(3 * k));
    const fx = [map(m, m + alt - fil), map(m + larg, m + alt - fil), map(m + larg, m + alt), map(m, m + alt)];
    page.drawRectangle({
      x: Math.min(...fx.map((p) => p.x)), y: Math.min(...fx.map((p) => p.y)),
      width: Math.abs(Math.max(...fx.map((p) => p.x)) - Math.min(...fx.map((p) => p.x))) || fil,
      height: Math.abs(Math.max(...fx.map((p) => p.y)) - Math.min(...fx.map((p) => p.y))) || fil,
      color: LARANJA,
    });

    const colRastreio = Math.min(160 * k, larg * 0.22); // a coluna do rótulo encolhe em folha pequena
    const y = m + alt - 15 * k;
    txt(m + 8 * k, y, titulo, { size: 9 * k, f: bold, cor: NAVY, max: colRastreio - 10 * k });
    txt(m + 8 * k, y - 12 * k, "RASTREABILIDADE (R) DO MATERIAL", { size: 6.5 * k, f: bold, cor: CINZA, max: colRastreio - 10 * k });
    txt(m + colRastreio, y - 11 * k, l1, { size: 8.5 * k, f: bold, cor: PRETO });
    if (l2) txt(m + colRastreio, y - 22 * k, l2, { size: 7 * k, cor: CINZA });
    if (anotar) txt(m + 8 * k, y - 36 * k, "Nº R do material usado: ____________________   Corrida: ____________________   Visto: __________", { size: 7.5 * k, f: bold, cor: PRETO });
    txt(m + 8 * k, m + 5 * k, rodape, { size: 6.5 * k, cor: CINZA });
  }

  pdf.setTitle(`${info.marca} — OP-${info.opNumero} (rastreado)`);
  pdf.setSubject(`Desenho emitido com rastreabilidade de material · ${fmtDataHora(quando)}`);
  pdf.setProducer("Portal Torg Metal");
  return pdf.save();
}
