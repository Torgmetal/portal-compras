// Projeção de leitura das fontes já usadas pelo PCP. Saldo entre etapas não é fila liberada.
export const ETAPAS_PAINEL = [
  ['CORTE', 'Corte', '/pcp/fila-corte'], ['MONTAGEM', 'Montagem', '/pcp/montagem'],
  ['SOLDA', 'Solda', '/pcp/fila-solda'], ['ACABAMENTO', 'Acabamento', '/pcp/fila-acabamento'],
  ['JATO', 'Jato', '/pcp/fila-jato'], ['PINTURA', 'Pintura', '/pcp/fila-pintura'],
];
export function resumoPainel(producao, corte) {
  const ops = producao?.ops;
  const etapas = ETAPAS_PAINEL.map(([key, label, href]) => ({ key, label, href,
    kg: ops ? ops.reduce((sum, op) => sum + (op.setores?.find(s => s.setor === key)?.pendenteKg || 0), 0) : null,
  }));
  const prioridades = ops ? ops.filter(o => o.atrasoDias > 0 || o.alertas?.length)
    .slice().sort((a, b) => (b.atrasoDias || 0) - (a.atrasoDias || 0)) : null;
  const cargas = (corte?.cargaMaquinas || []).filter(m => Number.isFinite(m.diasCarga));
  const maiorCarga = cargas.slice().sort((a, b) => b.diasCarga - a.diasCarga)[0] || null;
  const estoque = corte?.carteira?.pendente?.porEstoque;
  return { etapas, prioridades, atrasadas: ops ? ops.filter(o => o.atrasoDias > 0).length : null,
    maiorCarga, indisponivelKg: estoque ? estoque.find(s => s.statusEstoque === 'INDISPONIVEL')?.kg || 0 : null,
    programacoes: ops ? ops.flatMap(op => (op.liberacoes || []).map(l => ({ ...l, opNumero: op.opNumero, obra: op.obra })))
      .sort((a, b) => (a.dataProgramada || '9999').localeCompare(b.dataProgramada || '9999')) : null,
  };
}
