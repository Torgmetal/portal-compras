import { croquiCortado } from './prioridades-setor';

// Quem já desceu pode ser remanejado; a trava é a primeira entrada na bancada.
const JA_LIBERADO = new Set(['MONTAGEM', 'SOLDA', 'ACABAMENTO', 'JATO', 'PINTURA', 'EXPEDICAO', 'CONCLUIDO']);
export function prontidaoDoGantt(conjunto) {
  const croquis = (conjunto.conjuntoCroquis || []).map(r=>r.croqui);
  const total = croquis.length, cortados = croquis.filter(croquiCortado).length;
  const jaLiberado = JA_LIBERADO.has(conjunto.status);
  return {
    pronto: jaLiberado || (total > 0 && cortados === total),
    total, cortados,
    motivo: jaLiberado ? 'Já liberado para produção' : total > 0 && cortados === total ? 'Croquis cortados — apto para bancada'
      : total ? `${cortados}/${total} croquis cortados` : 'Sem croquis vinculados',
  };
}

export function conjuntoAguardandoCroquis(p) {
  return p.fonte === 'LPC_IMPORT' && p.tipoPeca === 'CONJUNTO' && !p._count?.conjuntoCroquis
    && ['PENDENTE', 'CORTE'].includes(p.status) && !croquiCortado(p);
}

export function itemAptoMontagem(item) {
  // Dados sem prontidão não autorizam a primeira entrada na bancada.
  return item.prontidao?.pronto === true;
}
