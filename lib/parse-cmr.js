import "server-only";
import ExcelJS from "exceljs";

// Parser da planilha de rastreabilidade CMR (Controle de Materiais) da Torg.
// Aba de dados = a do ano (ex.: "2026"); cabeçalho detectado por nome de coluna
// (robusto a reordenação). Cada linha de material vira um DocumentoQualidade
// categoria MATERIAL. NÃO inventa corrida — sinaliza linhas sem corrida (§4.4).

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

const cel = (v) => {
  if (v == null) return "";
  if (typeof v === "object") return String(v.text || v.result || v.hyperlink || (Array.isArray(v.richText) ? v.richText.map((t) => t.text).join("") : "") || "").trim();
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

function detectarColunas(ws, headerRow) {
  const row = ws.getRow(headerRow);
  const headers = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = norm(cel(cell.value));
  });
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

function acharHeaderRow(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
    const vals = (ws.getRow(r).values || []).slice(1).map((v) => norm(cel(v)));
    const temDesc = vals.some((v) => v.includes("descricao do material") || v === "descricao");
    const temCorrida = vals.some((v) => v.includes("corrida"));
    if (temDesc && temCorrida) return r;
  }
  return null;
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
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // aba de dados: a do ano (4 dígitos) ou a primeira que tenha o cabeçalho
  let ws = wb.worksheets.find((w) => /^\d{4}$/.test(w.name.trim()));
  if (!ws) ws = wb.worksheets.find((w) => acharHeaderRow(w));
  if (!ws) return { ok: false, erro: "Não encontrei a aba de dados (com colunas Descrição/Corrida)." };

  const headerRow = acharHeaderRow(ws);
  if (!headerRow) return { ok: false, erro: `Não encontrei o cabeçalho na aba "${ws.name}".` };

  const cols = detectarColunas(ws, headerRow);
  if (!cols.nome || !cols.numeroCorrida) {
    return { ok: false, erro: "Não encontrei as colunas obrigatórias (Descrição e Lote/Corrida)." };
  }

  const get = (row, campo) => (cols[campo] ? cel(row.getCell(cols[campo]).value) : "");

  const linhas = [];
  let semCorrida = 0, semIndice = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const nome = get(row, "nome");
    if (!nome) continue; // linha vazia

    const numeroCorrida = get(row, "numeroCorrida") || null;
    const importRef = get(row, "importRef") || null;
    const obra = get(row, "obra");
    const opNumero = soDigitos(obra);
    const avisos = [];
    if (!numeroCorrida) { avisos.push("sem corrida"); semCorrida++; }
    if (!importRef) { avisos.push("sem índice"); semIndice++; }

    const obsPartes = [];
    const pedido = get(row, "pedido"); if (pedido) obsPartes.push(`Pedido: ${pedido}`);
    const nf = get(row, "nf"); if (nf) obsPartes.push(`NF: ${nf}`);
    const receb = get(row, "dataReceb"); if (receb) obsPartes.push(`Receb.: ${receb}`);
    const peso = get(row, "peso"); if (peso) obsPartes.push(`Peso/litro: ${peso}`);
    const obs = get(row, "observacao"); if (obs) obsPartes.push(obs);

    linhas.push({
      linha: r,
      importRef,
      nome,
      tipo: "Certificado de material",
      norma: get(row, "norma") || null,
      numeroCorrida,
      numeroDocumento: get(row, "numeroDocumento") || null,
      opNumero,
      obra: obra || null,
      fornecedor: get(row, "fornecedor") || null,
      observacao: obsPartes.join(" · ") || null,
      avisos,
    });
  }

  const mapeamento = {};
  for (const [campo, col] of Object.entries(cols)) {
    mapeamento[campo] = cel(ws.getRow(headerRow).getCell(col).value);
  }

  return {
    ok: true,
    sheet: ws.name,
    headerRow,
    mapeamento,
    linhas,
    resumo: { total: linhas.length, comCorrida: linhas.length - semCorrida, semCorrida, semIndice },
  };
}
