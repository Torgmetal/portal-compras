import * as XLSX from "xlsx";
import { CATEGORIAS_PERFIL, CATALOGO_PARA_TIPO } from "@/lib/catalogo-perfis";

/**
 * Detecta se o buffer XLSX contem o formato "Levantamento de Estrutura"
 */
export function isLevantamentoEstrutura(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return false;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
    for (let i = 0; i < Math.min(12, rows.length); i++) {
      const row = rows[i];
      for (const cell of row) {
        const txt = (cell || "").toString().toLowerCase()
          .normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (txt.includes("levantamento") && txt.includes("estrutura")) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// Mapeamento de tipos/categorias da planilha → TipoMaterial do Prisma
const TIPO_MAP = {
  "viga w": "PERFIL_W", "vigas w": "PERFIL_W", "perfil w": "PERFIL_W", w: "PERFIL_W",
  "perfil hp": "PERFIL_W", hp: "PERFIL_W",
  "viga i": "PERFIL_W", "vigas i": "PERFIL_W", i: "PERFIL_W",
  "perfil h": "PERFIL_W", h: "PERFIL_W", heb: "PERFIL_W",
  "u laminado": "PERFIL_U", u: "PERFIL_U", udc: "PERFIL_U", ude: "PERFIL_U",
  "perfil c": "PERFIL_U", c: "PERFIL_U",
  "perfil z": "OUTRO", z: "OUTRO",
  cantoneira: "PERFIL_L", "cantoneira l": "PERFIL_L", l: "PERFIL_L",
  "barra chata": "BARRA_CHATA", chata: "BARRA_CHATA",
  "ferro redondo": "BARRA_REDONDA", redondo: "BARRA_REDONDA",
  "barra redonda": "BARRA_REDONDA",
  "tubo redondo": "TUBO_REDONDO",
  "tubo quadrado": "TUBO_QUADRADO",
  "tubo retangular": "TUBO_RETANGULAR",
  chapa: "CHAPA", "barra roscada": "BARRA_ROSCADA",
  tela: "TELA", "grade piso": "GRADE_PISO", degrau: "DEGRAU",
};

function detectTipoMaterial(tipoStr) {
  if (!tipoStr) return "OUTRO";
  const t = tipoStr.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Verificacao direta no enum
  const upper = tipoStr.toString().trim().toUpperCase();
  const validEnums = ["PERFIL_W","PERFIL_U","PERFIL_L","TUBO_REDONDO","TUBO_QUADRADO","TUBO_RETANGULAR","CHAPA","BARRA_REDONDA","BARRA_CHATA","BARRA_QUADRADA","BARRA_ROSCADA","TELA","GRADE_PISO","DEGRAU","OUTRO"];
  if (validEnums.includes(upper)) return upper;
  // Buscar no mapa
  for (const [key, tipo] of Object.entries(TIPO_MAP)) {
    if (t === key || t.includes(key)) return tipo;
  }
  return "OUTRO";
}

/**
 * Parse da planilha "Levantamento de Estrutura" → itens PesoProjetoItem
 * Colunas: A=Item, B=Material, C=Tipo, D=Perfil/Bitola, E=Qtde, F=Compr unit, G=Compr total, H=Peso kg/m, I=Peso Total
 */
export function parseLevantamentoEstrutura(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });

  let sheetName = wb.SheetNames[0];
  for (const name of wb.SheetNames) {
    if (name.toLowerCase().includes("levantamento")) {
      sheetName = name;
      break;
    }
  }

  const sheet = wb.Sheets[sheetName];
  if (!sheet) return { itens: [], erros: ["Planilha vazia"] };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  const itens = [];
  const erros = [];
  let headerRowIdx = -1;

  // Encontrar a linha de header (contem "Item" ou "Perfil" ou "Bitola")
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i];
    const txt = row.map((c) => (c || "").toString().toLowerCase()).join(" ");
    if (txt.includes("perfil") && txt.includes("bitola") || txt.includes("peso") && txt.includes("item")) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx < 0) {
    return { itens: [], erros: ["Header de colunas nao encontrado na planilha"] };
  }

  let ordem = 0;
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;

    // Col D = Perfil/Bitola (obrigatorio)
    const perfil = (row[3] || "").toString().trim();
    if (!perfil) continue;

    // Pular se eh "SUBTOTAL" ou "TOTAL"
    const colA = (row[0] || "").toString().trim().toUpperCase();
    if (colA.includes("SUBTOTAL") || colA.includes("TOTAL")) continue;

    // Col B = Material/Norma (ex: A572 Gr50, A36, CIVIL)
    const material = (row[1] || "").toString().trim() || null;
    // Col C = Tipo (ex: Viga W, Tubo Redondo)
    const tipo = (row[2] || "").toString().trim();
    const tipoMaterial = detectTipoMaterial(tipo);
    // Col E = Quantidade
    const quantidade = parseInt(row[4]) || 1;
    // Col F = Comprimento unitario (m)
    const comprimento = parseFloat(row[5]) || null;
    // Col H = Peso kg/m
    const pesoUnitario = parseFloat(row[7]) || 0;
    // Col I = Peso Total (ou calcular)
    let pesoTotal = parseFloat(row[8]) || 0;
    if (pesoTotal === 0 && pesoUnitario > 0 && comprimento > 0) {
      pesoTotal = quantidade * comprimento * pesoUnitario;
    }

    itens.push({
      tipoMaterial,
      descricao: perfil,
      norma: material,
      quantidade,
      comprimento,
      pesoUnitario,
      pesoTotal,
      ordem: ordem++,
    });
  }

  if (itens.length === 0) {
    erros.push("Nenhum item com perfil/bitola preenchido encontrado na planilha");
  }

  return { itens, erros };
}
