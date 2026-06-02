// lib/parse-lpc.js
// Parser para planilha LPC (Lista de Peças por Conjunto) — export Tekla

/**
 * Detecta se rows (array de arrays) sao formato LPC
 */
export function isLPCFormat(rows) {
  if (!rows || rows.length < 5) return false;
  const r0 = (rows[0]?.[0] || "").toString().toUpperCase();
  if (r0.includes("LISTA DE PE") && r0.includes("CONJUNTO")) return true;
  if (r0.includes("LPC")) return true;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] || []).map((c) => (c || "").toString().toUpperCase().trim());
    if (cells[0]?.includes("POSI") && cells.some((c) => c.includes("MATERIAL")) && cells.some((c) => c.includes("PINTURA"))) return true;
  }
  return false;
}

/**
 * Parseia rows do LPC (array de arrays do XLSX.utils.sheet_to_json header:1)
 * Retorna { opNumero, obra, cliente, conjuntos[], croquis[], avulsas[], relacoes[], pesoTotal, areaTotal }
 */
export function parseLPC(rows, options = {}) {
  const { opNumeroForcado } = options;

  let headerIdx = -1;
  let obra = null;
  let cliente = null;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const c0 = (rows[i]?.[0] || "").toString().trim();
    const upper = c0.toUpperCase();
    const mObra = c0.match(/OBRA[:\s]+(.+)/i);
    if (mObra) obra = mObra[1].trim();
    const mCli = c0.match(/CLIENTE[:\s]+(.+)/i);
    if (mCli) cliente = mCli[1].trim();
    if (upper.includes("POSI")) {
      const cells = (rows[i] || []).map((c) => (c || "").toString().toUpperCase().trim());
      if (cells.some((c) => c.includes("MATERIAL") || c.includes("QTDE"))) {
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx < 0) {
    return { erro: "Cabecalho 'POSICAO' nao encontrado na planilha. Verifique se o formato e LPC." };
  }

  const conjuntos = [];
  const croquiMap = new Map();
  const avulsas = [];
  const relacoes = [];

  let currentConjunto = null;
  let currentConjuntoQte = 1;
  let inAvulsas = false;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[0] == null) continue;

    const posicao = row[0].toString().trim();
    if (!posicao) continue;
    const upper = posicao.toUpperCase();

    if (upper.startsWith("TOTAI") || upper.startsWith("TOTAL")) continue;

    if (upper.includes("AVULSA")) {
      inAvulsas = true;
      currentConjunto = null;
      continue;
    }

    const qtde = parseInt(row[1]) || 1;
    const material = row[3] != null ? row[3].toString().trim() || null : null;
    const descricao = row[4] != null ? row[4].toString().trim() : null;
    const comprimento = row[5] != null ? parseFloat(row[5]) || null : null;
    const pesoUnit = parseFloat(row[6]) || 0;
    const pesoTotal = parseFloat(row[7]) || 0;
    const areaPintura = parseFloat(row[8]) || 0;

    // Pecas avulsas (apos header "PECAS AVULSAS")
    if (inAvulsas) {
      avulsas.push({
        marca: posicao,
        descricao,
        material,
        perfil: descricao,
        qte: qtde,
        comprimentoMm: comprimento,
        pesoUnitKg: pesoUnit,
        pesoTotalKg: pesoTotal,
        areaPinturaM2: areaPintura,
      });
      continue;
    }

    // Conjunto: sem material E sem comprimento
    if (!material && comprimento == null) {
      currentConjunto = posicao;
      currentConjuntoQte = qtde;
      conjuntos.push({
        marca: posicao,
        descricao,
        qte: qtde,
        pesoUnitKg: pesoUnit,
        pesoTotalKg: pesoTotal,
        areaPinturaM2: areaPintura,
      });
      continue;
    }

    // Croqui (tem material)
    if (croquiMap.has(posicao)) {
      const existing = croquiMap.get(posicao);
      existing.qte += qtde;
      existing.pesoTotalKg += pesoTotal;
      existing.areaPinturaM2 += areaPintura;
    } else {
      croquiMap.set(posicao, {
        marca: posicao,
        descricao,
        material,
        perfil: descricao,
        qte: qtde,
        comprimentoMm: comprimento,
        pesoUnitKg: pesoUnit,
        pesoTotalKg: pesoTotal,
        areaPinturaM2: areaPintura,
      });
    }

    if (currentConjunto) {
      relacoes.push({
        conjuntoMarca: currentConjunto,
        croquiMarca: posicao,
        qtdNoConjunto: qtde,
      });
    }
  }

  const croquis = [...croquiMap.values()];

  // Auto-detect OP number
  let opNumero = opNumeroForcado || null;
  if (!opNumero) {
    const allMarcas = [
      ...conjuntos.map((c) => c.marca),
      ...croquis.map((c) => c.marca),
      ...avulsas.map((a) => a.marca),
    ];
    opNumero = detectOpPrefix(allMarcas);
  }

  // Totais: conjuntos + avulsas (peso dos croquis ja esta incluido nos conjuntos)
  const pesoTotal = [...conjuntos, ...avulsas].reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
  const areaTotal = [...conjuntos, ...avulsas].reduce((s, p) => s + (p.areaPinturaM2 || 0), 0);

  return {
    opNumero,
    obra,
    cliente,
    conjuntos,
    croquis,
    avulsas,
    relacoes,
    pesoTotal: Math.round(pesoTotal * 100) / 100,
    areaTotal: Math.round(areaTotal * 100) / 100,
  };
}

/**
 * Detecta o prefixo da OP a partir das marcas
 * Ex: ["T82A2","T82A-P2","T82A4"] -> "T82A"
 */
function detectOpPrefix(marcas) {
  if (marcas.length === 0) return null;
  const cleaned = marcas.map((m) => m.replace(/-?P?\d+$/, ""));
  if (new Set(cleaned).size === 1 && cleaned[0]) return cleaned[0];
  // Fallback: longest common prefix
  let prefix = marcas[0];
  for (const m of marcas) {
    while (prefix && !m.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix || null;
}
