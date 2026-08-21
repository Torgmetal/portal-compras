import "server-only";
import { verticais } from "./campos-desenho";

// A LISTA DE MATERIAIS DO PRÓPRIO DESENHO.
//
// Vitor (21/08/2026), sobre o relatório dimensional: "as dimensões do projeto você deve preencher"
// — e, quando mostrei que a LPC e o desenho divergiam em 1 mm no T83A13 (lista 1035/2379, desenho
// 1034/2378): "melhor usar a informação do desenho".
//
// É a decisão certa: o desenho é o documento que vai pro chão de fábrica e é o que o inspetor tem
// na mão ao medir. Um relatório que contradiz o desenho ao lado trava a inspeção na primeira linha.
//
// A tabela lida é o quadro "LISTA DE MATERIAIS" do canto superior:
//
//   MARCA/POS. | QTD. | DESCRIÇÃO | COMPR. (mm) | MATERIAL | PESO (kg) UNIT./TOTAL | NOTAS
//
// ⚠ NÃO se lê por posição fixa. Cada desenho tem a sua largura de coluna e o Tekla move o quadro
// conforme o tamanho da peça. O que dá a coluna são as LINHAS VERTICAIS do próprio quadro; os
// títulos só dizem qual coluna é qual. As linhas de dados saem agrupando o texto por y.
//
// Validado em OP-083 e OP-084 (formatos e tamanhos diferentes): T83A13, T83A16, T83A17, T84A1,
// T84A2, T84A3 — todos lidos com marca, quantidade, descrição, comprimento, material e peso.

const RX_TITULO = /LISTA\s*DE\s*MATERIAIS/i;

// título da coluna → chave. O cabeçalho ocupa DUAS linhas ("MARCA"/"POS.", "COMPR."/"(mm)",
// "PESO (kg)"/"UNIT."/"TOTAL"), então cada chave pode ser reconhecida por mais de um título.
const COLUNAS = [
  { chave: "marca", rx: /^(MARCA|POS\.?)$/i },
  { chave: "qtd", rx: /^QTD\.?$/i },
  { chave: "descricao", rx: /^DESCRI[ÇC][ÃA]O$/i },
  { chave: "comprimento", rx: /^(COMPR\.?|\(mm\))$/i },
  { chave: "material", rx: /^MATERIAL$/i },
  { chave: "pesoUnit", rx: /^UNIT\.?$/i },
  { chave: "pesoTotal", rx: /^TOTAL$/i },
  { chave: "notas", rx: /^NOTAS$/i },
];

const num = (s) => {
  const t = String(s || "").trim().replace(/\.(?=\d{3}\b)/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
};

/** Agrupa itens de texto em linhas por y (a mesma linha varia alguns décimos entre células). */
function emLinhas(itens, tol = 2.5) {
  const linhas = [];
  for (const i of itens) {
    const y = i.transform[5];
    let l = linhas.find((l) => Math.abs(l.y - y) <= tol);
    if (!l) { l = { y, itens: [] }; linhas.push(l); }
    l.itens.push(i);
  }
  for (const l of linhas) l.itens.sort((a, b) => a.transform[4] - b.transform[4]);
  linhas.sort((a, b) => b.y - a.y);
  return linhas;
}

/**
 * Lê a LISTA DE MATERIAIS de um desenho (bytes do PDF).
 *
 * @returns {Promise<{itens:Array, pagina:number}|null>} null se o desenho não tem o quadro.
 */
export async function lerListaMateriais(pdfBytes) {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const { OPS } = await getResolvedPDFJS();
  const doc = await getDocumentProxy(new Uint8Array(pdfBytes));

  for (let n = 1; n <= doc.numPages; n++) {
    let pg, itens, ol;
    try {
      pg = await doc.getPage(n);
      itens = (await pg.getTextContent()).items.filter((i) => String(i.str).trim());
      ol = await pg.getOperatorList();
    } catch { continue; }

    // ⚠ O TÍTULO VEM PARTIDO. O pdf.js entrega "LISTA", " ", "DE", " ", "MATERIAIS" como itens
    // separados — procurar a frase inteira num item nunca acha. Junta a linha antes de comparar.
    const linhas = emLinhas(itens);
    const tituloLinha = linhas.find((l) => RX_TITULO.test(l.itens.map((i) => i.str).join("")));
    if (!tituloLinha) continue;
    const yTitulo = tituloLinha.y;

    // cabeçalho = títulos de coluna nos ~40 pt abaixo do título do quadro
    const cabecalho = [];
    for (const l of linhas) {
      if (l.y >= yTitulo || l.y < yTitulo - 40) continue;
      for (const i of l.itens) {
        const t = String(i.str).trim();
        const col = COLUNAS.find((c) => c.rx.test(t));
        if (col) cabecalho.push({ chave: col.chave, x: i.transform[4], y: i.transform[5], larg: i.width || 20 });
      }
    }
    if (!cabecalho.some((c) => c.chave === "marca") || !cabecalho.some((c) => c.chave === "comprimento")) continue;

    // ── AS BORDAS SAEM DAS LINHAS DA TABELA, NÃO DO x DO TÍTULO ────────────────────────────
    //
    // O dado é alinhado à esquerda dentro da célula e o título é centralizado: no T83A13,
    // "DESCRIÇÃO" começa em x=753 e o "W310X21" dela em x=730. Usar o x do título como borda joga
    // a descrição na coluna da quantidade. As verticais do próprio quadro dão a borda exata.
    const xEsq = Math.min(...cabecalho.map((c) => c.x)) - 30;
    const yBase = Math.min(...cabecalho.map((c) => c.y));
    const bordas = [...new Set(
      verticais(ol, OPS)
        .filter((v) => v.x >= xEsq - 20 && v.y2 >= yBase - 4 && v.y1 <= yTitulo + 4)
        .map((v) => Math.round(v.x * 10) / 10),
    )].sort((a, b) => a - b);
    if (bordas.length < 3) continue; // sem o quadro desenhado não dá pra separar coluna

    const colunaDe = (x) => {
      for (let i = 0; i < bordas.length - 1; i++) if (x >= bordas[i] - 1 && x < bordas[i + 1]) return i;
      return null;
    };

    // cada faixa entre bordas recebe a chave do título que cair dentro dela
    const chavePorFaixa = new Map();
    for (const c of cabecalho) {
      const f = colunaDe(c.x + c.larg / 2);
      if (f != null && !chavePorFaixa.has(f)) chavePorFaixa.set(f, c.chave);
    }
    if (![...chavePorFaixa.values()].includes("marca")) continue;

    const out = [];
    for (const l of linhas) {
      if (l.y >= yBase - 3) continue; // ainda é cabeçalho
      const daTabela = l.itens.filter((i) => i.transform[4] >= xEsq);
      if (!daTabela.length) continue;
      const junto = daTabela.map((i) => i.str).join("");
      // ⚠ para no rodapé "PESO TOTAL:" — dali pra baixo não é mais peça
      if (/PESO\s*TOTAL/i.test(junto)) break;

      const cel = {};
      for (const i of daTabela) {
        const f = colunaDe(i.transform[4]);
        const chave = f != null ? chavePorFaixa.get(f) : null;
        if (!chave) continue;
        cel[chave] = (cel[chave] || "") + String(i.str);
      }
      const marca = String(cel.marca || "").trim();
      if (!marca) continue;

      out.push({
        marca,
        qtd: num(cel.qtd),
        descricao: String(cel.descricao || "").trim() || null,
        comprimento: num(cel.comprimento),
        material: String(cel.material || "").trim() || null,
        pesoUnit: num(cel.pesoUnit),
        pesoTotal: num(cel.pesoTotal),
      });
    }

    if (out.length) return { itens: out, pagina: n };
  }
  return null;
}
