import { croquiCortado } from './prioridades-setor';

// Quem já desceu pode ser remanejado; a trava é a primeira entrada na bancada.
const JA_LIBERADO = new Set(['MONTAGEM', 'SOLDA', 'ACABAMENTO', 'JATO', 'PINTURA', 'EXPEDICAO', 'CONCLUIDO']);
export function prontidaoDoGantt(conjunto) {
  const croquis = (conjunto.conjuntoCroquis || []).map(r=>r.croqui);
  const total = croquis.length, cortados = croquis.filter(croquiCortado).length;
  const jaLiberado = JA_LIBERADO.has(conjunto.status);
  // ⚠ marca AVULSA (sem croquis vinculados) não passa por Montagem nem Solda: do corte vai ao Jato. O motivo
  // dizia "Já liberado para produção" com pronto=false — o PCP lia "liberado" e não entendia por que não
  // conseguia imprimir/liberar (OP-113, 35 marcas T113A-P*, 14/09/2026).
  if (!total) return { pronto: false, total, cortados, motivo: 'Peça avulsa, sem croquis: não passa pela Montagem — do corte vai direto ao Jato' };
  return {
    pronto: jaLiberado || cortados === total,
    total, cortados,
    motivo: jaLiberado ? 'Já liberado para produção' : cortados === total ? 'Croquis cortados — apto para bancada' : `${cortados}/${total} croquis cortados`,
  };
}

export function itemAptoMontagem(item) {
  // Dados sem prontidão não autorizam a primeira entrada na bancada.
  return item.prontidao?.pronto === true;
}
