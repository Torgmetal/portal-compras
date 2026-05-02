// Parser de planilha Tekla (.xlsx) — extrai metadados de cabeçalho e itens.
// Uso: const { meta, itens } = await parseTekla(file)

export async function parseTekla(file) {
  if (!file) return { meta: {}, itens: [] };

  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellFormula: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const meta = extractMeta(rawRows);
  const headerIdx = findHeader(rawRows);

  let dados = [];
  if (headerIdx >= 0) {
    const headers = rawRows[headerIdx].map((h) => String(h).trim());
    for (let r = headerIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.every((c) => c === "" || c == null)) continue;
      const firstCell = String(row[0] ?? "").trim().toUpperCase();
      if (firstCell.startsWith("TOTAL") || firstCell.startsWith("OBSERVA") || firstCell.startsWith("PEDIDO")) break;
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] != null ? row[i] : ""; });
      dados.push(obj);
    }
  } else {
    dados = XLSX.utils.sheet_to_json(ws);
  }

  const itens = dados
    .map(normalize)
    .filter((d) => d.descricao && d.descricao.toLowerCase() !== "item" && d.descricao.toLowerCase() !== "total ->");

  return { meta, itens };
}

function extractMeta(rawRows) {
  const meta = {};
  const total = rawRows.length;
  const ranges = [[0, Math.min(15, total)], [Math.max(0, total - 10), total]];
  for (const [start, end] of ranges) {
    for (let r = start; r < end; r++) {
      const row = rawRows[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] ?? "").trim();
        const next = c + 1 < row.length ? String(row[c + 1] ?? "").trim() : "";
        if (cell === "OS:" && next) meta.os = next;
        if (cell === "RM:" && next) meta.rmRef = next;
        if (cell === "Cliente:" && next) meta.cliente = next;
        if (cell === "Obra:" && next) meta.obra = next;
        if (cell === "C. de Custo:" && next) meta.centroCusto = next;
        if (cell === "Finalidade:" && next) meta.finalidade = next;
        if ((cell === "Revisão:" || cell === "Revisao:") && next) meta.revisao = next;
        if (cell.toLowerCase().startsWith("requisitante:")) {
          meta.solicitante = cell.replace(/requisitante:\s*/i, "").trim();
        }
      }
    }
  }
  return meta;
}

function findHeader(rawRows) {
  for (let r = 0; r < Math.min(20, rawRows.length); r++) {
    const rowStr = rawRows[r].map((c) => String(c).toLowerCase()).join("|");
    if (rowStr.includes("descri") && (rowStr.includes("qtd") || rowStr.includes("item"))) {
      return r;
    }
  }
  return -1;
}

function normalize(row) {
  const keys = Object.keys(row);
  const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t)));
  const findExact = (terms) => keys.find((k) => {
    const kl = k.toLowerCase();
    return terms.every((t) => kl.includes(t));
  });

  const descricao = String(row[find(["descri", "nome", "produto", "peça", "peca"])] || row[keys[0]] || "").trim();
  const codigo = String(row[find(["codigo", "código", "cod"])] || "").trim();
  const qtdRaw = String(row[find(["qtd", "quant", "quantidade", "qty"])] || "1");
  const qtd = parseFloat(qtdRaw.replace(/[^\d.,]/g, "").replace(",", ".")) || 1;
  const unidade = String(row[find(["unid", "und", "un", "uom"])] || "UN").trim();
  const comprimento = String(row[find(["comp", "length", "tamanho"])] || "").trim();
  const material = String(row[find(["mat", "grade", "aço", "aco"])] || "").trim();
  const largura = String(row[find(["larg", "width"])] || "").trim();
  const tratamento = String(row[find(["tratamento", "treat", "acabamento"])] || "").trim();
  const pesoLinearRaw = String(row[find(["peso/m", "peso linear", "peso/m²"])] || "0");
  const pesoLinear = parseFloat(pesoLinearRaw.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
  const pesoTotalKey = findExact(["peso", "total"]) || findExact(["peso", "kg"]);
  const pesoTotalRaw = String(row[pesoTotalKey] || "0");
  let peso = parseFloat(pesoTotalRaw.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
  if (peso === 0 && pesoLinear > 0) {
    const compNum = parseFloat(String(comprimento).replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
    if (compNum > 0) peso = pesoLinear * compNum * qtd;
  }
  return { descricao, codigo, qtd, unidade, peso, comprimento, material, largura, tratamento, pesoLinear };
}
