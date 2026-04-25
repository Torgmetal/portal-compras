// Parser de cotações em PDF (lado servidor).
// Roda numa API route do Next.js (Node runtime) e usa pdf-parse pra extrair
// texto preservando newlines — diferente do pdfjs no browser, que junta com
// espaços e perde a estrutura. Testado contra 4 PDFs reais (Soufer x3 + Gerdau).
//
// Saída: { fornecedor, formato, prazoPagamento, itens: [...], avisos: [] }
// Cada item: {item, descricao, codigo, qtd, qtdSolicitada, qtdCotada, unidade,
//             precoUnit, total, icmsPct, ipiPct, prazoEntrega,
//             observacao, _centro?}.

function brNum(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function detectFormato(text) {
  if (/Soufer/i.test(text)) return "soufer";
  if (/Gerdau|BRL\s*\/\s*KG/i.test(text)) return "gerdau";
  return "generic";
}

function extractFornecedor(text, formato) {
  if (formato === "soufer") {
    if (/Soufer\s*Industrial/i.test(text)) return "Soufer Industrial Ltda";
  }
  if (formato === "gerdau") {
    const m = text.match(/Dados\s+Emissor[\s\S]{0,200}?\d+\s*-\s*([A-Z][A-Z0-9\s]+?)(?:\s+\d{5}|\s{2,}|\n)/);
    if (m) return m[1].trim();
    if (/Gerdau/i.test(text)) return "Gerdau";
  }
  return "";
}

// ─── SOUFER ───
// Linha tipo (com centro):
// 10 5110300022-W 1.420 KG TBQDFQ100X100X4,75X6000RIANBR6591CIVIL300 1109 6,64 12,00 5,00 9.900,24
// Ou sem centro (visto em alguns PDFs):
// 10 1365150300-W 472 KG CHPGR6,30X1500X3000N11889CV300 6,48 12,00 10,00 2.691,53
// Ou desc com espaços:
// 30 2023000000 227 KG FERROCANT.3X1/4 6MT. 1101 6,39 12,00 0,00 1.450,53
// → item, codigo, qtd, un, desc(pode ter espaços), centro(opcional), precoUN, ICMS%, IPI%, total
const SOUFER_RE =
  /(\d{1,3})\s+([A-Z0-9][\w-]*)\s+([\d.,]+)\s+(KG|UN|MT|M|PC|PÇ)\s+(.+?)\s+(?:(\d{4})\s+)?([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)(?=\s|$)/gi;

function parseSoufer(text) {
  const headerMatch = text.match(/Item\s+Material\s+Quantidade/i);
  let corpus = headerMatch ? text.substring(headerMatch.index + headerMatch[0].length) : text;
  corpus = corpus.replace(/(Peso\s+total\s+te[oó]rico|Valor\s+total\s+te[oó]rico)[\s\S]*$/i, "");

  // O Soufer (via unpdf no servidor) intercala blocos de metadata entre a
  // descrição e o centro+preços do item, num parágrafo sem quebras de linha:
  //   "...desc... Código NCM:NNN Unidade Medida pç ____ Quantidade N
  //    Observações N TEXTO 1109 7,46 12,00 3,25 127.783,65"
  // Em itens com pouco ruído (item 70 do 20238073), o regex captura o NCM como
  // precoUnit, dando R$ 72.163.200/kg. Limpamos cada bloco antes do regex,
  // ANCORANDO no próximo padrão real (centro 4-dígitos OU 2 preços em sequência
  // com vírgula decimal — caso de itens sem centro).
  corpus = corpus
    .replace(/Código\s*NCM\s*:?\s*\d*/gi, " ")
    .replace(/Unidade\s+Medida\s+(?:PÇ|pç|PEÇA|UN|KG|TON|MT|M)\b/gi, " ")
    .replace(/_{3,}/g, " ")
    .replace(/Quantidade\s+\d+/gi, " ")
    .replace(
      /Observações\s*\d+\s+[A-Z0-9À-ÚÇa-z][A-Z0-9À-ÚÇa-z ]{0,40}?(?=\s+\d{4}\s+\d|\s+\d+,\d+\s+\d+,\d+|\s+\d{1,3}\s+[A-Z0-9][\w-]{4,}\s+[\d.,]+\s+(?:KG|UN|MT|M|PC|PÇ)|$)/gi,
      " "
    );

  const itens = [];
  let m;
  SOUFER_RE.lastIndex = 0;
  while ((m = SOUFER_RE.exec(corpus)) !== null) {
    const qtd = brNum(m[3]);
    itens.push({
      item: m[5].trim(),
      descricao: m[5].trim(),
      codigo: m[2],
      qtd,
      qtdSolicitada: qtd,
      qtdCotada: qtd,
      unidade: (m[4] || "").toUpperCase(),
      precoUnit: brNum(m[7]),
      total: brNum(m[10]),
      icmsPct: brNum(m[8]),
      ipiPct: brNum(m[9]),
      prazoEntrega: "",
      observacao: "",
      _centro: m[6],
    });
  }
  // Condição de pagamento (geralmente 28DDL para Soufer)
  const cond = text.match(/Condi[çc][ãa]o\s+de\s+pagamento[\s\S]{0,80}?(\b\d+\s*DDL\b|\b\d+\s*dias\b)/i);
  return { itens, prazoPagamento: cond ? cond[1].trim() : "" };
}

// ─── GERDAU ───
// Linha tipo:
// 10 CHAPA LQ A36 6,3X1200X3000 544,320 KG 544,320 KG 23/04/2026 5,91 BRL/KG 18,00 % 3,25 % 0,00 % 3.318,70 BRL
// → item, descricao, qtd, preço, ICMS%, IPI%, total
const GERDAU_RE =
  /(\d{1,3})\s+(.+?)\s+([\d.,]+)\s+KG\s+[\d.,]+\s+KG\s+\d{2}\/\d{2}\/\d{4}\s+([\d.,]+)\s+BRL\/KG\s+([\d.,]+)\s*%\s+([\d.,]+)\s*%\s+[\d.,]+\s*%\s+([\d.,]+)\s+BRL/gi;

function parseGerdau(text) {
  const headerMatch = text.match(/Item\s+Descri[cç][ãa]o\s+Qtd/i);
  let corpus = headerMatch ? text.substring(headerMatch.index + headerMatch[0].length) : text;
  // Remove "Prazo de Pagamento: Z028-28 dias, data Nota Fiscal" entre itens
  corpus = corpus.replace(/Prazo\s+de\s+Pagamento\s*:[^,]+?,\s*data\s+Nota\s+Fiscal/gi, " | ");
  corpus = corpus.replace(/TOTAL\s+KG[\s\S]*$/i, "");

  const itens = [];
  let m;
  GERDAU_RE.lastIndex = 0;
  while ((m = GERDAU_RE.exec(corpus)) !== null) {
    const desc = m[2].trim();
    const qtd = brNum(m[3]);
    itens.push({
      item: desc,
      descricao: desc,
      codigo: "",
      qtd,
      qtdSolicitada: qtd,
      qtdCotada: qtd,
      unidade: "KG",
      precoUnit: brNum(m[4]),
      total: brNum(m[7]),
      icmsPct: brNum(m[5]),
      ipiPct: brNum(m[6]),
      prazoEntrega: "",
      observacao: "",
    });
  }
  const prazo = text.match(/Prazo\s+de\s+Pagamento\s*:\s*([^\n]+?)(?:\n|$)/i);
  return { itens, prazoPagamento: prazo ? prazo[1].trim() : "" };
}

export function parseCotacaoText(text) {
  const formato = detectFormato(text);
  let result = { itens: [], prazoPagamento: "" };

  if (formato === "soufer") result = parseSoufer(text);
  else if (formato === "gerdau") result = parseGerdau(text);

  const fornecedor = extractFornecedor(text, formato);
  return {
    fornecedor,
    formato,
    prazoPagamento: result.prazoPagamento,
    itens: result.itens,
    avisos:
      result.itens.length === 0
        ? ["Nenhum item reconhecido. Formato pode ser diferente — me avisa pra eu adicionar suporte."]
        : [],
  };
}
