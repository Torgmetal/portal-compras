// Diff PURO entre a LPC carregada e uma nova revisão (sem banco — testável).
// Regra (decisão do Vitor): mesclar por marca preservando o progresso,
// sinalizando conflito quando a revisão mexe numa peça que já produziu.

// Peça "já passou por algum setor": teve baixa no Syneco OU avançou além do corte.
// (PENDENTE e CORTE-sem-baixa ainda não foram produzidas — podem ser mexidas.)
export function jaProduzida(p) {
  return (Number(p.qteProduzida) || 0) > 0 || !["PENDENTE", "CORTE"].includes(p.status);
}

// Achata o parseLPC em mapa marca → { tipo, dados da peça }
export function marcasDoParsed(parsed) {
  const m = new Map();
  const put = (marca, tipo, d) => { if (marca && !m.has(marca)) m.set(marca, { tipo, ...d }); };
  for (const c of parsed.conjuntos || []) put(c.marca, "CONJUNTO", { descricao: c.descricao, qte: c.qte, pesoUnitKg: c.pesoUnitKg, pesoTotalKg: c.pesoTotalKg, areaPinturaM2: c.areaPinturaM2 });
  for (const cr of parsed.croquis || []) put(cr.marca, "CROQUI", { descricao: cr.descricao, material: cr.material, perfil: cr.perfil, qte: cr.qte, comprimentoMm: cr.comprimentoMm, pesoUnitKg: cr.pesoUnitKg, pesoTotalKg: cr.pesoTotalKg, areaPinturaM2: cr.areaPinturaM2 });
  for (const a of parsed.avulsas || []) put(a.marca, "AVULSA", { descricao: a.descricao, material: a.material, perfil: a.perfil, qte: a.qte, comprimentoMm: a.comprimentoMm, pesoUnitKg: a.pesoUnitKg, pesoTotalKg: a.pesoTotalKg });
  return m;
}

/**
 * @param {Array} existentes - PecaConjunto atuais da OP (fonte LPC) { marca, status, qte, qteProduzida }
 * @param {Map} novas - saída de marcasDoParsed
 * @returns { adicionar[], remover[], atualizar[], conflitos[] }
 */
export function computarDiffLpc(existentes, novas) {
  const exMap = new Map(existentes.map((p) => [p.marca, p]));
  const adicionar = [];
  const remover = [];
  const atualizar = [];
  const conflitos = [];

  for (const [marca, nova] of novas) {
    const atual = exMap.get(marca);
    if (!atual) { adicionar.push(marca); continue; }
    const qtdMudou = Number(atual.qte) !== Number(nova.qte);
    // peso só conta como mudança se o existente tiver o valor para comparar
    const pesoMudou = atual.pesoTotalKg != null &&
      Math.abs(Number(atual.pesoTotalKg) - Number(nova.pesoTotalKg || 0)) > 0.01;
    if (qtdMudou && jaProduzida(atual)) {
      conflitos.push({ marca, tipo: "QTD_ALTERADA_PRODUZIDA", status: atual.status, qteProduzida: atual.qteProduzida || 0, de: atual.qte, para: nova.qte });
    } else if (qtdMudou || pesoMudou) {
      atualizar.push(marca); // mudou de fato → atualiza dados (preserva status)
    }
    // senão: inalterado — não gera escrita (evita milhares de updates à toa)
  }
  for (const [marca, atual] of exMap) {
    if (novas.has(marca)) continue;
    if (jaProduzida(atual)) {
      conflitos.push({ marca, tipo: "REMOVIDA_PRODUZIDA", status: atual.status, qteProduzida: atual.qteProduzida || 0, de: atual.qte, para: 0 });
    } else {
      remover.push(marca);
    }
  }
  return { adicionar, remover, atualizar, conflitos };
}
