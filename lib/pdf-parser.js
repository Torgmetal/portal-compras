"use client";

// Parser unificado de cotações em PDF.
// Suporta Soufer + Gerdau explicitamente; tenta um fallback genérico
// para outros fornecedores. Retorna sempre no mesmo shape
// {fornecedor, formato, itens, avisos}. Cada item tem
// {item, descricao, codigo, qtd, unidade, precoUnit, total,
//  condicao, prazoEntrega, _pdfOrigDesc, _pdfMaterial}.

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

async function ensurePdfJs() {
  if (typeof window === "undefined") throw new Error("PDF parser só roda no cliente");
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PDFJS_URL;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Falha ao carregar pdf.js"));
      document.head.appendChild(s);
    });
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  return window.pdfjsLib;
}

async function bytesFromSource(source) {
  // Aceita File, ArrayBuffer, Uint8Array ou data URL (string começando com "data:")
  if (!source) throw new Error("Arquivo vazio");
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (typeof source === "string" && source.startsWith("data:")) {
    const base64 = source.split(",")[1] || "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (typeof source.arrayBuffer === "function") {
    return new Uint8Array(await source.arrayBuffer());
  }
  throw new Error("Fonte de PDF não reconhecida");
}

export async function extractPdfText(source) {
  const pdfjsLib = await ensurePdfJs();
  const bytes = await bytesFromSource(source);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  let full = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    full += tc.items.map((i) => i.str).join(" ") + "\n";
  }
  return full;
}

function brNum(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function detectFormato(text) {
  const t = text.replace(/\s+/g, " ");
  if (/Soufer/i.test(t)) return "soufer";
  if (/Gerdau|BRL\s*\/\s*KG/i.test(t)) return "gerdau";
  return "generic";
}

function extractFornecedor(text, formato) {
  // Tenta pegar o emissor/vendedor
  if (formato === "soufer") {
    const m = text.match(/Soufer\s*Industrial\s*LTDA[^\n]*/i);
    if (m) return "Soufer Industrial Ltda";
  }
  if (formato === "gerdau") {
    // "Dados Emissor ... NOME ..."
    const m = text.match(/Dados\s+Emissor[\s\S]{0,200}?\d+\s*-\s*([A-Z][A-Z0-9\s]+?)(?:\s+\d{5}|\s{2,}|\n)/);
    if (m) return m[1].trim();
    if (/Gerdau/i.test(text)) return "Gerdau (via emissor)";
  }
  return "";
}

// ─────────── SOUFER ───────────
// Linha tipo:
//   10 5110300022-W 1.420 KG TBQDFQ100X100X4,75X6000RIANBR6591CIVIL300 1109 6,64 12,00 5,00 9.900,24
const SOUFER_ITEM_RE = /(\d{1,3})\s+([A-Z0-9][\w-]*)\s+([\d.,]+)\s+(KG|UN|MT|M|PC|PÇ)\s+(\S+)\s+(\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d.,]+)/gi;

function parseSoufer(text) {
  const itens = [];
  let m;
  SOUFER_ITEM_RE.lastIndex = 0;
  while ((m = SOUFER_ITEM_RE.exec(text)) !== null) {
    itens.push({
      item: m[5], // descrição serve de chave de match (no Soufer é "bunched", ex CHPGR12,50X1500...)
      descricao: m[5],
      codigo: m[2],
      qtd: brNum(m[3]),
      unidade: (m[4] || "").toUpperCase(),
      precoUnit: brNum(m[7]),
      total: brNum(m[10]),
      condicao: "",
      prazoEntrega: "",
      _pdfOrigDesc: m[5],
      _pdfMaterial: m[2],
      _centro: m[6],
    });
  }
  // Condição de pagamento (ex "28DDL") aparece única no cabeçalho
  const cond = text.match(/Condi[çc][ãa]o\s+de\s+pagamento[\s\S]{0,60}?(\b\d+\s*DDL\b|\b\d+\s*dias\b)/i);
  if (cond) itens.forEach((it) => (it.condicao = cond[1]));
  return itens;
}

// ─────────── GERDAU ───────────
// Linha tipo:
//   10 CHAPA LQ A36 6,3X1200X3000 544,320 KG 544,320 KG 23/04/2026 5,91 BRL/KG 18,00 % 3,25 % 0,00 % 3.318,70 BRL
const GERDAU_ITEM_RE = /(\d{1,3})\s+(.+?)\s+([\d.,]+)\s+KG\s+[\d.,]+\s+KG\s+\d{2}\/\d{2}\/\d{4}\s+([\d.,]+)\s+BRL\/KG[\s\S]*?([\d.,]+)\s+BRL/gi;
const GERDAU_PRAZO_RE = /Prazo\s+de\s+Pagamento\s*:\s*([^\n]+?)(?:\n|$)/i;

function parseGerdau(text) {
  const itens = [];
  let m;
  GERDAU_ITEM_RE.lastIndex = 0;
  while ((m = GERDAU_ITEM_RE.exec(text)) !== null) {
    const desc = m[2].trim();
    itens.push({
      item: desc,
      descricao: desc,
      codigo: "",
      qtd: brNum(m[3]),
      unidade: "KG",
      precoUnit: brNum(m[4]),
      total: brNum(m[5]),
      condicao: "",
      prazoEntrega: "",
      _pdfOrigDesc: desc,
      _pdfMaterial: "",
      _centro: "",
    });
  }
  // Prazo de pagamento (normalmente igual em todos os itens da Gerdau)
  const prazo = text.match(GERDAU_PRAZO_RE);
  if (prazo) itens.forEach((it) => (it.condicao = prazo[1].trim()));
  return itens;
}

// ─────────── FALLBACK GENÉRICO ───────────
// Tenta reconhecer linhas com item# + descrição + qtd + preço + total.
// Heurística simples para não quebrar em PDFs desconhecidos.
const GENERIC_ITEM_RE = /(?:^|\s)(\d{1,3})\s+([A-Z][A-Z0-9\s.,\/x-]{5,60}?)\s+([\d.,]+)\s+(KG|UN|PC|PÇ|M|MT)\s+[\s\S]{0,120}?R?\$?\s*([\d.,]+)(?:\s*\/\s*(?:KG|UN|PC))?\s+[\s\S]{0,80}?([\d.]+,\d{2})/gi;

function parseGeneric(text) {
  const itens = [];
  let m;
  GENERIC_ITEM_RE.lastIndex = 0;
  while ((m = GENERIC_ITEM_RE.exec(text)) !== null) {
    const desc = m[2].trim();
    const precoUnit = brNum(m[5]);
    const total = brNum(m[6]);
    const qtd = brNum(m[3]);
    if (precoUnit <= 0 || total <= 0) continue;
    itens.push({
      item: desc,
      descricao: desc,
      codigo: "",
      qtd,
      unidade: (m[4] || "").toUpperCase(),
      precoUnit,
      total,
      condicao: "",
      prazoEntrega: "",
      _pdfOrigDesc: desc,
      _pdfMaterial: "",
      _centro: "",
    });
  }
  return itens;
}

export async function parsePdfCotacao(source, { fornecedorFallback } = {}) {
  const text = await extractPdfText(source);
  const formato = detectFormato(text);
  let itens = [];
  if (formato === "soufer") itens = parseSoufer(text);
  else if (formato === "gerdau") itens = parseGerdau(text);
  else itens = parseGeneric(text);

  const fornecedor = extractFornecedor(text, formato) || fornecedorFallback || "Fornecedor PDF";
  const avisos = [];
  if (itens.length === 0) {
    avisos.push("Nenhum item reconhecido automaticamente — preencha manualmente.");
  }
  return { fornecedor, formato, itens, avisos, _rawTextLen: text.length };
}
