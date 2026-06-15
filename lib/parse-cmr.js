import "server-only";
import * as XLSX from "xlsx";

// Parser da planilha de rastreabilidade CMR (Controle de Materiais) da Torg.
// Aba de dados = a do ano (ex.: "2026"); cabeçalho detectado por nome de coluna
// (robusto a reordenação). Cada linha de material vira um DocumentoQualidade
// categoria MATERIAL. NÃO inventa corrida — sinaliza linhas sem corrida (§4.4).
//
// Usa SheetJS (xlsx) lendo SÓ a aba do ano, em modo denso: o CMR é grande (~17MB,
// pesado de imagens/formatação) e o ExcelJS estourava a memória da função (OOM)
// ao carregar o workbook inteiro. SheetJS lê só as células dos dados, leve e rápido.

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

const cel = (v) => {
  if (v == null) return "";
  if (typeof v === "object") return String(v.text || v.result || v.w || v.v || (Array.isArray(v.richText) ? v.richText.map((t) => t.text).join("") : "") || "").trim();
  return String(v).trim();
};

// aliases (substring no header normalizado) → campo
const CAMPOS = {
  importRef: ["indice r", "indice"],
  nome: ["descricao do material", "descricao"],
  numeroDocumento: ["n do certificado", "no do certificado", "numero do certificado", "certificado"],
  numeroCorrida: ["lote / corrida", "lote/corrida", "corrida", "lote"],
  norma: ["especificacao tecnica", "especificacao", "norma"],
  pedido: ["pedido de compras", "pedido"],
  dataReceb: ["data de receb", "data receb", "recebimento"],
  nf: ["n nota fiscal", "no nota fiscal", "nota fiscal", "nf"],
  fornecedor: ["fornecedor"],
  obra: ["obra"],
  quantidade: ["quantidade em pcs", "quantidade", "qtde", "pcs"],
  peso: ["peso/litro", "peso / litro", "peso", "litro"],
  observacao: ["observacao", "obs"],
};

// aba → array-de-arrays (0-based), células como texto formatado (raw:false)
function linhasDaAba(ws) {
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "", raw: false });
}

function acharHeaderRow(rows) {
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const vals = (rows[r] || []).map((v) => norm(cel(v)));
    const temDesc = vals.some((v) => v.includes("descricao do material") || v === "descricao");
    const temCorrida = vals.some((v) => v.includes("corrida"));
    if (temDesc && temCorrida) return r; // índice 0-based da linha do cabeçalho
  }
  return -1;
}

function detectarColunas(headerArr) {
  const headers = {};
  (headerArr || []).forEach((v, col) => { headers[col] = norm(cel(v)); });
  const map = {};
  for (const [campo, aliases] of Object.entries(CAMPOS)) {
    for (const [col, h] of Object.entries(headers)) {
      if (!h) continue;
      if (aliases.some((a) => h.includes(a))) {
        // não sobrescreve um match já feito por alias mais específico
        if (map[campo] == null) map[campo] = Number(col);
      }
    }
  }
  return map;
}

const soDigitos = (s) => {
  const m = String(s || "").match(/\d+/);
  return m ? m[0] : null;
};

/**
 * @param {Buffer} buffer - xlsx
 * @returns {Promise<{ok:boolean, erro?:string, sheet?:string, headerRow?:number, mapeamento?:object, linhas?:Array, resumo?:object}>}
 */
export async function parseCMR(buffer) {
  // 1) leitura LEVE só pra listar as abas (não carrega as células)
  let nomes;
  try {
    nomes = XLSX.read(buffer, { type: "buffer", bookSheets: true }).SheetNames || [];
  } catch {
    return { ok: false, erro: "Não consegui abrir a planilha (arquivo inválido ou corrompido?)." };
  }

  // aba de dados: a do ano mais recente (4 dígitos); senão a primeira com cabeçalho
  const anos = nomes.filter((n) => /^\d{4}$/.test(String(n).trim())).sort();
  let sheetName = anos.length ? anos[anos.length - 1] : null;
  let rows;

  if (sheetName) {
    // lê SÓ a aba do ano — baixo consumo de memória
    const wb = XLSX.read(buffer, { type: "buffer", sheets: sheetName, dense: true, raw: false });
    rows = linhasDaAba(wb.Sheets[sheetName]);
  } else {
    const wb = XLSX.read(buffer, { type: "buffer", dense: true, raw: false });
    for (const n of wb.SheetNames) {
      const rs = linhasDaAba(wb.Sheets[n]);
      if (acharHeaderRow(rs) >= 0) { sheetName = n; rows = rs; break; }
    }
  }
  if (!sheetName || !rows) return { ok: false, erro: "Não encontrei a aba de dados (com colunas Descrição/Corrida)." };

  const headerRow = acharHeaderRow(rows);
  if (headerRow < 0) return { ok: false, erro: `Não encontrei o cabeçalho na aba "${sheetName}".` };

  const cols = detectarColunas(rows[headerRow]);
  if (cols.nome == null || cols.numeroCorrida == null) {
    return { ok: false, erro: "Não encontrei as colunas obrigatórias (Descrição e Lote/Corrida)." };
  }

  const get = (rowArr, campo) => (cols[campo] != null ? cel((rowArr || [])[cols[campo]]) : "");

  const linhas = [];
  let semCorrida = 0, semIndice = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const rowArr = rows[r] || [];
    const nome = get(rowArr, "nome");
    if (!nome) continue; // linha vazia

    const numeroCorrida = get(rowArr, "numeroCorrida") || null;
    const importRef = get(rowArr, "importRef") || null;
    const obra = get(rowArr, "obra");
    const opNumero = soDigitos(obra);
    const avisos = [];
    if (!numeroCorrida) { avisos.push("sem corrida"); semCorrida++; }
    if (!importRef) { avisos.push("sem índice"); semIndice++; }

    const obsPartes = [];
    const pedido = get(rowArr, "pedido"); if (pedido) obsPartes.push(`Pedido: ${pedido}`);
    const nf = get(rowArr, "nf"); if (nf) obsPartes.push(`NF: ${nf}`);
    const receb = get(rowArr, "dataReceb"); if (receb) obsPartes.push(`Receb.: ${receb}`);
    const peso = get(rowArr, "peso"); if (peso) obsPartes.push(`Peso/litro: ${peso}`);
    const obs = get(rowArr, "observacao"); if (obs) obsPartes.push(obs);

    linhas.push({
      linha: r + 1, // 1-based, como aparece no Excel
      importRef,
      nome,
      tipo: "Certificado de material",
      norma: get(rowArr, "norma") || null,
      numeroCorrida,
      numeroDocumento: get(rowArr, "numeroDocumento") || null,
      opNumero,
      obra: obra || null,
      fornecedor: get(rowArr, "fornecedor") || null,
      observacao: obsPartes.join(" · ") || null,
      avisos,
    });
  }

  const mapeamento = {};
  for (const [campo, col] of Object.entries(cols)) {
    mapeamento[campo] = cel(rows[headerRow][col]);
  }

  return {
    ok: true,
    sheet: sheetName,
    headerRow: headerRow + 1,
    mapeamento,
    linhas,
    resumo: { total: linhas.length, comCorrida: linhas.length - semCorrida, semCorrida, semIndice },
  };
}
