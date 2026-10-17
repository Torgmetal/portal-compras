// Conferência somente com registros do Syneco. Baixa no portal, romaneio e
// encaminhamento não inventam produção; a rota apenas define quais etapas comparar.
const CADEIA = ['Montagem', 'Solda', 'Acabamento', 'Jato', 'Pintura'];
const ROTA = ['MONTAGEM', 'SOLDA', 'ACABAMENTO', 'JATO', 'PINTURA', 'EXPEDICAO'];
const chave = (opId, marca) => JSON.stringify([opId, marca]);
const chaveInativo = r => JSON.stringify([r.op, r.item, r.operacao]);

export function conferirFurosApontamento({ pecas, ordens, inativos = [] }) {
  const porPeca = new Map();
  for (const p of pecas) {
    if (!p.opId) continue;
    const k = chave(p.opId, p.marca);
    if (!porPeca.has(k)) porPeca.set(k, []);
    porPeca.get(k).push(p);
  }
  const inativoSet = new Set(inativos.map(chaveInativo));
  const grupos = new Map();
  for (const r of ordens) {
    const candidatas = porPeca.get(chave(r.opId, r.item));
    if (!candidatas || !r.obra || !CADEIA.includes(r.setor)) continue;
    if (inativoSet.has(chaveInativo(r)) && !r.produzidoUn) continue;
    // Mesmo nome em outra OP/obra nunca completa a cadeia desta peça.
    const k = JSON.stringify([r.opId, r.obra, r.item]);
    if (!grupos.has(k)) grupos.set(k, { candidatas, obra: r.obra, setores: {} });
    const g = grupos.get(k);
    const s = g.setores[r.setor] ||= { produzido: 0, planejado: 0 };
    s.produzido += Math.max(0, Number(r.produzidoUn) || 0);
    s.planejado += Math.max(0, Number(r.planejadoUn) || 0);
  }
  const furos = [];
  for (const { candidatas, obra, setores } of grupos.values()) {
    const p = candidatas[0];
    const ambigua = candidatas.length !== 1;
    const retorno = p.terceirizado ? ROTA.indexOf(p.destinoTerceirizado) : 0;
    const encaminhado = ROTA.indexOf(p.encaminhadoSetor);
    const rotaIndefinida = p.terceirizado && retorno < 0;
    // Em vínculo ambíguo não escolher a rota de uma fase arbitrariamente.
    const inicio = ambigua || rotaIndefinida ? 0 : Math.max(0, retorno, encaminhado);
    let pior = null;
    for (let j = inicio; j < CADEIA.length; j++) {
      const atual = setores[CADEIA[j]];
      if (!atual) continue; // etapa sem ordem não equivale a zero apontado
      for (let i = inicio; i < j; i++) {
        if (CADEIA[i] === 'Acabamento') continue; // etapa opcional
        const anterior = setores[CADEIA[i]];
        if (!anterior) continue;
        const diff = atual.produzido - anterior.produzido;
        if (diff > 0 && (!pior || diff > pior.diff)) {
          pior = { setor: CADEIA[j], valor: atual.produzido,
            setorUp: CADEIA[i], valorUp: anterior.produzido, diff };
        }
      }
    }
    if (!pior) continue;
    const qte = ambigua ? null : Number(p.qte) || 0;
    const qtdDivergente = !ambigua && Object.values(setores).some(s => s.produzido > qte || s.planejado !== qte);
    const situacao = ambigua ? 'CONFERIR_VINCULO' : rotaIndefinida ? 'CONFERIR_ROTA'
      : qtdDivergente ? 'CONFERIR_QUANTIDADE' : 'CONFERIR_APONTAMENTO';
    const observacao = ambigua ? 'Marca em mais de uma fase da LPC; confirmar o vínculo da ordem.'
      : rotaIndefinida ? 'Peça terceirizada sem setor de retorno definido; confirmar a rota.'
      : qtdDivergente ? 'Quantidade da LPC difere do planejado ou produzido no Syneco; conferir antes de lançar.'
      : 'Conferir os registros das duas etapas antes de lançar; a diferença não confirma produção faltante.';
    furos.push({ opId: p.opId, op: p.op?.numero || '',
      opNumero: [...new Set(candidatas.map(c => c.opNumero).filter(Boolean))].join(' / '),
      obraSyneco: obra, marca: p.marca, qte, ...pior, situacao, observacao,
      cadeia: Object.fromEntries(CADEIA.map(s => [s, setores[s]?.produzido ?? null])),
      resumo: `${pior.setor} ${pior.valor} acima de ${pior.setorUp} ${pior.valorUp}` });
  }
  return furos.sort((a, b) => a.op.localeCompare(b.op, 'pt-BR', { numeric: true })
    || a.obraSyneco.localeCompare(b.obraSyneco) || a.marca.localeCompare(b.marca, 'pt-BR', { numeric: true }));
}
