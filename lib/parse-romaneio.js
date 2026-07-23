import * as XLSX from "xlsx";

// Parser do ROMANEIO (FORM 22 / "Expedição - SGQ 048"). Cada arquivo é uma carga.
// A tabela tem cabeçalho com "Desenho" (= marca da lista de expedição) e
// "Peso (Kg) - Total"; o rodapé traz "CARREGADO CONFORME" com o total da carga,
// que usamos como CONFERÊNCIA da soma das linhas.
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const num = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const serialParaData = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);

/** Nº do romaneio: rótulo "N°" no cabeçalho → 1ª célula à direita; senão, o
 *  prefixo do arquivo ("01. ROMANEIO OP 083…"), que é consistente na pasta. */
function acharNumero(rows, nomeArquivo) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) {
      if (/^n[°ºo]\.?$/.test(norm(r[c]))) {
        for (let k = c + 1; k < r.length; k++) {
          const v = r[k];
          if (v != null && String(v).trim()) return String(v).trim().replace(/\.+$/, "");
        }
      }
    }
  }
  const m = String(nomeArquivo).match(/^\s*(\d{1,3})\s*[.\-]/);
  return m ? m[1].replace(/^0+(?=\d)/, "") : null;
}

/** Data de saída da carga (o "expedido em"). Aceita serial do Excel, Date e dd/mm/aaaa. */
function acharDataSaida(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) {
      if (!/data\s*de\s*saida/.test(norm(r[c]))) continue;
      for (let k = c + 1; k < r.length; k++) {
        const v = r[k];
        if (v == null || String(v).trim() === "") continue;
        if (v instanceof Date && !isNaN(v)) return v;
        if (typeof v === "number" && v > 20000) return serialParaData(v);
        const m = String(v).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
        if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return new Date(Date.UTC(+y, +m[2] - 1, +m[1])); }
      }
    }
  }
  return null;
}

const COLS = {
  marca:     (h) => h.startsWith("desenho") || h === "marca" || h.startsWith("pos"),
  qtd:       (h) => h.startsWith("qnt") || h.startsWith("qtd") || h.startsWith("qte") || h.startsWith("quant"),
  descricao: (h) => h.startsWith("descric"),
  peso:      (h) => h.includes("peso"),
};

/** @param {Buffer} buffer @param {string} [nomeArquivo] */
export function parseRomaneio(buffer, nomeArquivo = "") {
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer" }); }
  catch (e) { return { ok: false, erro: "Não foi possível abrir a planilha: " + e.message }; }

  // aba do romaneio (ou a 1ª)
  const sheetName = wb.SheetNames.find((s) => /romaneio|expedic/i.test(norm(s))) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, blankrows: false });

  // 1) cabeçalho da tabela: linha que tem "desenho"/"marca" E "peso"
  let hRow = -1;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const cs = (rows[i] || []).map(norm);
    const temMarca = cs.some((c) => c.startsWith("desenho") || c === "marca");
    const temPeso = cs.some((c) => c.includes("peso"));
    if (temMarca && temPeso) { hRow = i; break; }
  }
  if (hRow < 0) return { ok: false, erro: "Cabeçalho (Desenho/Peso) não encontrado", abas: wb.SheetNames, sheet: sheetName };

  const header = (rows[hRow] || []).map(norm);
  const idx = {};
  for (const [k, match] of Object.entries(COLS)) {
    const c = header.findIndex((h) => h && match(h));
    if (c >= 0 && idx[k] === undefined) idx[k] = c;
  }
  if (idx.marca === undefined || idx.peso === undefined) return { ok: false, erro: "Colunas Desenho/Peso não mapeadas", header };

  // 2) itens (para no rodapé "CARREGADO CONFORME" / linhas vazias)
  const itens = [];
  let totalDeclarado = null;
  let vazios = 0;
  for (let i = hRow + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const linhaToda = norm(r.join(" "));
    if (/carregado conforme|total geral|^total\b/.test(linhaToda)) {
      // o total da carga costuma ser o último número da linha
      for (let k = r.length - 1; k >= 0; k--) { const n = num(r[k]); if (n != null) { totalDeclarado = n; break; } }
      break;
    }
    const marca = r[idx.marca] != null ? String(r[idx.marca]).trim() : "";
    if (!marca) { if (++vazios > 15) break; continue; }
    if (norm(marca) === "desenho" || norm(marca) === "marca") continue;
    const peso = num(r[idx.peso]);
    if (peso == null && num(r[idx.qtd]) == null) continue; // linha de texto solta
    vazios = 0;
    itens.push({
      marca,
      qtd: idx.qtd !== undefined ? num(r[idx.qtd]) : null,
      descricao: idx.descricao !== undefined ? String(r[idx.descricao] ?? "").trim() : "",
      pesoKg: peso ?? 0,
    });
  }

  const pesoSomado = itens.reduce((s, it) => s + (it.pesoKg || 0), 0);
  return {
    ok: true,
    sheet: sheetName,
    arquivo: nomeArquivo,
    numero: acharNumero(rows, nomeArquivo),
    dataSaida: acharDataSaida(rows),
    itens,
    totais: {
      itens: itens.length,
      marcas: new Set(itens.map((i) => i.marca.trim().toUpperCase())).size,
      pesoSomado,
      pesoDeclarado: totalDeclarado,
    },
  };
}
