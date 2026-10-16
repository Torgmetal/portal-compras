// ─── AS FONTES DO PACKING LIST DA VALMET, NA PASTA DA OBRA ──────────────────────────────────────
//
// Vitor (16/10/2026): "para as obras da Valmet teremos esse modelo, precisa acessar a pasta da obra e verificar as
// informações e preencher todas as informações". Puro: recebe texto (do PDF) ou o buffer da planilha.
//   - OC da Valmet (1.3 Pedido de compras): Order Txt "351/401541" (companhia/OC — é como a Valmet pede na NF), o
//     projeto (J5A199) e o código do material de cada posição (ISL007000);
//   - Instrução de Faturamento (mesma pasta): o comprador (dados da NF de venda) e o contato na obra;
//   - Lista de Equivalência Torg × Valmet (2.5.2.5): por marca, o Valmet Code ("Desenho Valmet").
import ExcelJS from "exceljs";

const linhaDepois = (texto, rx) => String(texto || "").match(rx)?.[1]?.trim() || null;

/** @returns {{ orderTxt:string|null, projeto:string|null, itens:{posicao:number,codigo:string}[] }} */
export function lerOcValmet(texto) {
  const t = String(texto || "");
  const itens = [...t.matchAll(/^\s*(\d{1,3})\s+([A-Z]{2,}\d{3,})\s/gm)].map((m) => ({ posicao: Number(m[1]), codigo: m[2] }));
  return {
    // ⚠ sem \b na frente: o unpdf cola "Página351/401541", e entre "a" e "3" não há fronteira de palavra
    orderTxt: t.match(/(\d{3})\s*\/\s*(\d{6})\b/)?.slice(1, 3).join("/") || null,
    projeto: linhaDepois(t, /\bProjeto\s+([A-Z0-9]{5,})\b/),
    itens,
  };
}

/** O comprador é o dos "DADOS NF VENDA"; o contato na obra é o PRIMEIRO nome da lista (o modelo tem um só). */
export function lerInstrucaoValmet(texto) {
  const t = String(texto || "");
  const venda = t.split(/DADOS NF VENDA/i)[1] || "";
  const razao = venda.split("\n").map((l) => l.trim()).find((l) => /\b(ltda|s\.?a\.?)\.?$/i.test(l)) || null;
  return {
    projeto: linhaDepois(t, /PROJETO:\s*([A-Z0-9]{5,})\b/),
    cliente: linhaDepois(t, /CLIENTE:\s*(.+?)\s+CONTATO/),
    comprador: {
      razao,
      cnpj: linhaDepois(venda, /CNPJ:\s*([\d./-]+)/),
      cep: linhaDepois(venda, /CEP:\s*([\d.-]+)/),
      endereco: linhaDepois(venda, /Endere[cç]o:\s*(.+)/),
      cidadeUf: linhaDepois(venda, /Cidade:\s*(.+)/),
    },
    contato: linhaDepois(t, /Contato na Obra:\s*([^,\n]+?)(?:,|\s+Telefone|\n)/),
    telefone: linhaDepois(t, /Contato na Obra:.*?Telefone:\s*(\(?\d[\d()\s-]{7,}\d)/),
  };
}

/** "_R01", "-R1", " rev1" → 1; sem marca de revisão → 0. ⚠ o \bR(\d+)\b da TMSA não vê "_R01". */
export const revisaoValmet = (nome) => Number(String(nome || "").match(/(?:[_\s-]R|\brev\.?\s*)(\d+)(?=[^\\/]*$)/i)?.[1] ?? 0);

/** O arquivo de maior revisão entre os que casam com `rx` (quem chama já tirou a pasta OBSOLETOS). */
export function maisRecente(arquivos, rx) {
  const casam = (arquivos || []).filter((a) => rx.test(a.name));
  return casam.sort((a, b) => revisaoValmet(b.name) - revisaoValmet(a.name))[0] || null;
}

const texto = (v) => {
  if (v && typeof v === "object") v = v.result ?? v.richText?.map((r) => r.text).join("") ?? "";
  return String(v ?? "").trim();
};
const chaveMarca = (s) => String(s ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * marca → { valmet, bracell, torg, rev }. Lê TODAS as abas (uma por desenho de montagem) e acha as colunas pela linha
 * de cabeçalho ("MARCA", "DESENHO VALMET"…) — a revisão da lista pode mover colunas. Marca repetida em dois desenhos de
 * montagem fica com a primeira.
 * @param {Buffer} buffer
 */
export async function lerEquivalenciaValmet(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const mapa = new Map();
  for (const ws of wb.worksheets) {
    let col = null, inicio = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 30) && !col; r++) {
      const cab = {};
      ws.getRow(r).eachCell((c, n) => { cab[texto(c.value).toUpperCase()] = n; });
      if (cab.MARCA && cab["DESENHO VALMET"]) {
        col = { marca: cab.MARCA, valmet: cab["DESENHO VALMET"], bracell: cab["DESENHO BRACELL"], torg: cab["DESENHO TORG"], rev: cab["REV."] || cab.REV };
        inicio = r + 1;
      }
    }
    if (!col) continue;
    for (let r = inicio; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const marca = chaveMarca(texto(row.getCell(col.marca).value));
      if (!marca || marca === "MARCA" || mapa.has(marca)) continue;
      const valmet = texto(row.getCell(col.valmet).value);
      if (!valmet) continue;
      mapa.set(marca, {
        valmet,
        bracell: col.bracell ? texto(row.getCell(col.bracell).value) || null : null,
        torg: col.torg ? texto(row.getCell(col.torg).value) || null : null,
        rev: col.rev ? texto(row.getCell(col.rev).value) || null : null,
      });
    }
  }
  return mapa;
}
