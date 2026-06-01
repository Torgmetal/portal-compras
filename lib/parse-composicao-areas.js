import * as XLSX from "xlsx";

// Mapeamento de secoes da planilha → CategoriaAcessorio do Prisma
const SECAO_MAP = [
  { pattern: /1\.\s*telha/i, categoria: "TELHA" },
  { pattern: /2\.\s*grade/i, categoria: "GRADE_PISO" },
  { pattern: /3\.\s*steel\s*deck/i, categoria: "STEEL_DECK" },
  { pattern: /4\.\s*pain[eé]is?\s*iso/i, categoria: "ISOLAMENTO" },
  { pattern: /5\.\s*acess[oó]rios/i, categoria: "OUTRO" },
];

function normalize(str) {
  if (!str) return "";
  return str.toString().trim();
}

function detectSecao(cellValue) {
  const txt = normalize(cellValue);
  if (!txt) return null;
  for (const { pattern, categoria } of SECAO_MAP) {
    if (pattern.test(txt)) return categoria;
  }
  return null;
}

/**
 * Detecta se o buffer XLSX contem o formato "Composicao de Areas"
 * Verifica se alguma das primeiras 15 linhas tem "COMPOSICAO DE AREAS" ou secoes numeradas
 */
export function isComposicaoAreas(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return false;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const row = rows[i];
      for (const cell of row) {
        const txt = normalize(cell).toLowerCase()
          .normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (txt.includes("composicao de areas")) return true;
        if (/^1\.\s*telha/i.test(normalize(cell))) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Faz o parse da planilha "Composicao de Areas" e retorna itens prontos para AcessorioItem
 * @param {Buffer} buffer — arquivo XLSX
 * @returns {{ itens: Array, erros: string[] }}
 */
export function parseComposicaoAreas(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });

  // Procura a aba certa (primeira, ou a que tem "Composicao" no nome)
  let sheetName = wb.SheetNames[0];
  for (const name of wb.SheetNames) {
    if (name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes("composicao")) {
      sheetName = name;
      break;
    }
  }

  const sheet = wb.Sheets[sheetName];
  if (!sheet) return { itens: [], erros: ["Planilha vazia"] };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  const itens = [];
  const erros = [];
  let categoriaAtual = null;
  let ordem = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // col A (index 0) pode ter header de secao
    const colA = normalize(row[0]);

    // Detectar header de secao
    const secao = detectSecao(colA);
    if (secao) {
      categoriaAtual = secao;
      continue;
    }

    // Pular linhas de header de tabela, subtotal, total
    if (/^(item|subtotal|total)/i.test(colA)) continue;
    if (!categoriaAtual) continue;

    // Coluna B = produto (index 1)
    const produto = normalize(row[1]);
    if (!produto) continue;

    // Coluna C = area m2 (index 2)
    const areaM2 = parseFloat(row[2]) || 0;
    // Coluna D = peso kg/m2 (index 3)
    const pesoM2 = parseFloat(row[3]) || 0;
    // Coluna E = peso total kg (index 4)
    const pesoTotal = parseFloat(row[4]) || 0;
    // Coluna F = valor unitario R$/m2 (index 5)
    const valorUnit = parseFloat(row[5]) || null;
    // Coluna G = valor total (index 6) — calculado, nao armazena

    const especParts = [];
    if (pesoM2 > 0) especParts.push(`${pesoM2} kg/m2`);
    if (pesoTotal > 0) especParts.push(`Peso total: ${pesoTotal} kg`);

    itens.push({
      categoria: categoriaAtual,
      descricao: produto,
      especificacao: especParts.length > 0 ? especParts.join(" | ") : null,
      unidade: "m2",
      quantidade: areaM2,
      custoUnitario: valorUnit,
      observacao: null,
      ordem: ordem++,
    });
  }

  if (itens.length === 0) {
    erros.push("Nenhum item com produto preenchido encontrado na planilha");
  }

  return { itens, erros };
}
