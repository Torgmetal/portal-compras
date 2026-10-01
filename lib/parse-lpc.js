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

  // Coluna de observação (opcional): galvanização, terceirização, "pintado pronto",
  // área do parafuso… Detecta pelo cabeçalho; -1 se a planilha não tiver.
  let obsIdx = -1;
  {
    const hc = rows[headerIdx] || [];
    for (let c = 0; c < hc.length; c++) {
      const n = (hc[c] || "").toString().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (n.includes("OBSERV") || n.trim() === "OBS") { obsIdx = c; break; }
    }
  }
  const lerObs = (row) => (obsIdx >= 0 && row[obsIdx] != null ? String(row[obsIdx]).trim() || null : null);

  const conjuntos = [];
  const croquiMap = new Map();
  const avulsas = [];
  const relacoes = [];
  // peso TOTAL de cada conjunto pela conta das suas posições (qtde × unitário) — ver `pesoConferido`
  const somaPosicoes = new Map();
  let linhasCorrigidas = 0;
  let planilhaKg = 0;

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
    const pesoPlanilha = parseFloat(row[7]) || 0;
    const areaPintura = parseFloat(row[8]) || 0;
    const ehConjunto = !inAvulsas && !material && comprimento == null;
    // conjunto é conferido no fim, pela soma das posições; posição e avulsa, aqui
    const pesoTotal = ehConjunto ? pesoPlanilha : pesoConferido(qtde, pesoUnit, pesoPlanilha);
    if (pesoTotal !== pesoPlanilha) linhasCorrigidas++;
    if (ehConjunto || inAvulsas) planilhaKg += pesoPlanilha; // o total que a PLANILHA declarava

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
        observacao: lerObs(row),
      });
      continue;
    }

    // Conjunto: sem material E sem comprimento
    if (ehConjunto) {
      currentConjunto = posicao;
      currentConjuntoQte = qtde;
      conjuntos.push({
        marca: posicao,
        descricao,
        qte: qtde,
        pesoUnitKg: pesoUnit,
        pesoTotalKg: pesoTotal,
        areaPinturaM2: areaPintura,
        observacao: lerObs(row),
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
        observacao: lerObs(row),
      });
    }

    if (currentConjunto) {
      relacoes.push({
        conjuntoMarca: currentConjunto,
        croquiMarca: posicao,
        qtdNoConjunto: qtde,
      });
      somaPosicoes.set(currentConjunto, (somaPosicoes.get(currentConjunto) || 0) + (pesoUnit > 0 ? qtde * pesoUnit : pesoTotal));
    }
  }

  const croquis = [...croquiMap.values()];

  // ⚠ O CONJUNTO SÓ É REFEITO QUANDO A PLANILHA JÁ ERROU NAS POSIÇÕES. Template coerente fica como
  // veio, inclusive o conjunto que difere da soma por arredondamento (88,08 × 88,05).
  const conjuntosCorrigidos = linhasCorrigidas > 0 ? refazerConjuntos(conjuntos, somaPosicoes) : 0;

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
    // ⚠ quem importou precisa SABER que a planilha veio errada: o portal grava o certo, mas o arquivo
    // arquivado e impresso continua com o erro até a Engenharia corrigir o template
    correcaoPeso: linhasCorrigidas > 0
      ? { linhas: linhasCorrigidas, conjuntos: conjuntosCorrigidos, planilhaKg: arred(planilhaKg), contaKg: arred(pesoTotal) }
      : null,
  };
}

// ─── PESO TOTAL É CONFERIDO, NÃO COPIADO ──────────────────────────────────────
// ⚠⚠ O template novo do Tekla 2025 ("02 TORG_Lista de peças por conj" — T105D, T120B, T124A; 29 e
// 30/09/2026) escreve PESO TOTAL = (2·QTDE − 1) × PESO UNIT em toda posição com mais de uma peça, e o
// peso do conjunto soma esses totais: a T124A entrou com 29.614 kg contra 21.255 kg da LE. O
// UNITÁRIO está certo (bate com a LP e com a LE) — então, quando a planilha diverge da conta, vale a
// conta. No template antigo a conta fecha em todas as linhas (T118B 502/502, T94A 205/205) e nada muda.
const arred = (v) => Math.round(v * 100) / 100;
// arredondamento do Tekla/Excel não é erro: 2% ou 50 g, o que for maior
const tolerancia = (v) => Math.max(0.05, Math.abs(v) * 0.02);
function pesoConferido(qtde, pesoUnit, pesoPlanilha) {
  if (!(pesoUnit > 0)) return pesoPlanilha; // sem unitário não há conta para conferir
  const conta = qtde * pesoUnit;
  return Math.abs(pesoPlanilha - conta) > tolerancia(conta) ? arred(conta) : pesoPlanilha;
}

/**
 * Refaz o peso dos conjuntos pela soma das posições (já conferidas). Devolve quantos mudaram.
 *
 * ⚠⚠ A QTDE DA POSIÇÃO JÁ É A DE TODAS AS UNIDADES DO CONJUNTO: a soma das posições é o peso TOTAL
 * dele, e o unitário sai da divisão. Conferido nas planilhas reais (01/10/2026): T124A4, 2 unidades,
 * soma 318,5 kg → 159,25 cada (LE 159,30); T105D1, 30 unidades → 21,5 (LE 21,5). A primeira versão
 * desta conta multiplicava de novo pelas unidades e mandava a T120B a 2 milhões de kg.
 */
function refazerConjuntos(conjuntos, somaPosicoes) {
  let n = 0;
  for (const c of conjuntos) {
    const soma = somaPosicoes.get(c.marca);
    if (!(soma > 0) || Math.abs(c.pesoTotalKg - soma) <= tolerancia(soma)) continue;
    c.pesoTotalKg = arred(soma);
    c.pesoUnitKg = arred(soma / Math.max(1, c.qte));
    n++;
  }
  return n;
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
