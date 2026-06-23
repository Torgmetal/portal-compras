// Parser da "Lista Avançada Expedição" (.xlsm) que a Engenharia mantém por frente.
// Lê a aba PROJETO: tabela de marcas previstas (Item/Marca/Qte/Descrição/Revisão/
// Peso) + totais reportados (contratado/expedido/faltante) do cabeçalho.
// Robusto a pequenas variações de layout: acha a linha de cabeçalho por nome de
// coluna e mapeia por posição. NÃO depende de prisma (testável isolado).
import * as XLSX from "xlsx";

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const num = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// frente a partir do nome do arquivo: "T36-Lista...", "T61 - 01 Lista...",
// "OP-50_Lista...", "001 Lista..." → T36 / T61 / OP-50 / null
export function frenteDoNome(nome = "") {
  const m = String(nome).match(/\b(T\d{2,3}[A-Z]?|OP-?\d{2,3}[A-Z]?)\b/i);
  return m ? m[1].toUpperCase().replace(/^OP-?/, "OP-") : null;
}

// revisão a partir do nome: R1/R01, "Rev 2", ou data dd mm aaaa. Sem isso, null.
export function revisaoDoNome(nome = "") {
  const r = String(nome).match(/\bR(?:ev)?\.?\s*0*(\d{1,3})\b/i);
  if (r) return { tipo: "R", valor: parseInt(r[1], 10), raw: r[0].trim() };
  const d = String(nome).match(/(\d{1,2})[ ._-](\d{1,2})[ ._-](20\d{2})/);
  if (d) return { tipo: "DATA", valor: `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`, raw: d[0] };
  return null;
}

const COLS = {
  item:      (h) => h === "item",
  marca:     (h) => h === "marca",
  qte:       (h) => h.startsWith("qte") || h === "qtd" || h === "quantidade",
  descricao: (h) => h.startsWith("descric"),
  revisao:   (h) => h.startsWith("revis"),
  pesoTotal: (h) => h.includes("peso") && h.includes("total"),
  pesoUnit:  (h) => h.includes("peso") && (h.includes("unit") || h.includes("unt")),
  areaTotal: (h) => h.includes("area") && h.includes("total"),
  expedido:  (h) => h.includes("expedido"),
  status:    (h) => h.startsWith("status"),
};

/** @param {Buffer} buffer @param {string} [nomeArquivo] */
export function parseListaAvancada(buffer, nomeArquivo = "") {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.find((s) => norm(s).includes("projeto")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });

  // 1) acha a linha de cabeçalho (tem "marca" e "peso")
  let hRow = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] || []).map(norm);
    if (cells.some((c) => c === "marca") && cells.some((c) => c.includes("peso"))) { hRow = i; break; }
  }
  if (hRow < 0) return { ok: false, erro: "Cabeçalho (Marca/Peso) não encontrado na aba PROJETO", sheet: sheetName, abas: wb.SheetNames };

  // 2) mapeia colunas por posição
  const header = (rows[hRow] || []).map(norm);
  const idx = {};
  for (const [k, match] of Object.entries(COLS)) {
    const c = header.findIndex((h) => h && match(h));
    if (c >= 0 && idx[k] === undefined) idx[k] = c;
  }
  if (idx.marca === undefined || idx.pesoTotal === undefined) {
    return { ok: false, erro: "Colunas Marca/Peso Total não mapeadas", header };
  }

  // 3) lê as marcas (até acabar a tabela)
  const marcas = [];
  let vazios = 0;
  for (let i = hRow + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const marca = r[idx.marca] != null ? String(r[idx.marca]).trim() : "";
    if (!marca) { if (++vazios > 25) break; continue; }
    if (norm(marca) === "marca") continue; // cabeçalho repetido
    vazios = 0;
    const pesoExp = idx.expedido !== undefined ? (r[idx.expedido] != null && String(r[idx.expedido]).trim() !== "") : null;
    marcas.push({
      item: idx.item !== undefined ? (num(r[idx.item]) ?? r[idx.item]) : null,
      marca,
      qte: idx.qte !== undefined ? (num(r[idx.qte]) ?? 1) : 1,
      descricao: idx.descricao !== undefined ? String(r[idx.descricao] ?? "").trim() : "",
      revisao: idx.revisao !== undefined ? (num(r[idx.revisao]) ?? 0) : 0,
      pesoUnit: idx.pesoUnit !== undefined ? num(r[idx.pesoUnit]) : null,
      pesoTotal: num(r[idx.pesoTotal]) ?? 0,
      areaTotal: idx.areaTotal !== undefined ? num(r[idx.areaTotal]) : null,
      status: idx.status !== undefined ? (r[idx.status] != null ? String(r[idx.status]).trim() : null) : null,
      // o arquivo marca o "expedido" preenchendo a coluna Marca(Expedido)
      expedidoArquivo: pesoExp,
    });
  }

  // 4) totais reportados no cabeçalho (contratado/expedido/faltante) — best-effort
  const topo = rows.slice(0, hRow + 2);
  const acharTotal = (regex) => {
    for (const r of topo) {
      for (let c = 0; c < (r || []).length; c++) {
        if (regex.test(norm(r[c]))) {
          // pega o primeiro número à direita na mesma linha
          for (let k = c + 1; k < r.length; k++) { const n = num(r[k]); if (n != null) return n; }
        }
      }
    }
    return null;
  };
  const pesoContratadoReport = acharTotal(/contratad/);
  const pesoExpedidoReport = acharTotal(/expedid/);
  const pesoFaltanteReport = acharTotal(/faltant/);

  const pesoTotalSomado = marcas.reduce((s, m) => s + (m.pesoTotal || 0), 0);
  const expedidasArquivo = marcas.filter((m) => m.expedidoArquivo).length;

  return {
    ok: true,
    sheet: sheetName,
    frente: frenteDoNome(nomeArquivo),
    revisao: revisaoDoNome(nomeArquivo),
    totais: {
      marcas: marcas.length,
      qtdItens: marcas.reduce((s, m) => s + (m.qte || 0), 0),
      pesoTotalSomado,
      pesoContratadoReport,
      pesoExpedidoReport,
      pesoFaltanteReport,
      expedidasArquivo,
    },
    marcas,
  };
}
