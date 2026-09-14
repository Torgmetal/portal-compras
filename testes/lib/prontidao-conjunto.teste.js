import { expect, it } from 'vitest';
import { calcularProntidao, CROQUI_PRONTIDAO_SELECT } from '@/lib/prontidao-conjunto';
import { croquiCortado } from '@/lib/prioridades-setor';

const conj = (...croquis) => ({ conjuntoCroquis: croquis.map((croqui) => ({ croqui })) });

// OP-113 (14/09/2026): T113A38 tinha T113A-P52 (132/132 no Syneco) e T113A-P53 (0/28 no Syneco, mas
// `corteConcluidoEm` gravado pela baixa). A lista do PCP dizia "2/2 pronto" e a liberação recusava
// com "1/2 croquis cortados" — duas regras para a mesma pergunta.
it('croqui com corteConcluidoEm conta como cortado mesmo com qteProduzida zero', () => {
  const p = calcularProntidao(conj({ marca: 'P52', qte: 132, qteProduzida: 132 }, { marca: 'P53', qte: 28, qteProduzida: 0, corteConcluidoEm: new Date('2026-09-11') }));
  expect(p.pronto).toBe(true);
  expect(p.atendidos).toBe(2);
  expect(p.itens.find((i) => i.marca === 'P53')).toMatchObject({ ok: true, falta: 0, qteProduzida: 28 });
});
it('baixa de corte (baixaSetores.CORTE) conta como cortado', () => {
  const p = calcularProntidao(conj({ marca: 'A', qte: 4, qteProduzida: 0, baixaSetores: { CORTE: { qtd: 4 } } }));
  expect(p).toMatchObject({ pronto: true, atendidos: 1, categoria: 'PRONTO' });
});
it('sem baixa e sem apontamento continua pendente', () => {
  const p = calcularProntidao(conj({ marca: 'A', qte: 4, qteProduzida: 1 }, { marca: 'B', qte: 2, qteProduzida: 0, baixaSetores: {} }));
  expect(p).toMatchObject({ pronto: false, atendidos: 0, categoria: 'PARCIAL' });
});
it('a prontidão usa a mesma regra da lista do PCP (croquiCortado)', () => {
  const casos = [{ qte: 3, qteProduzida: 0, corteConcluidoEm: '2026-09-11' }, { qte: 3, qteProduzida: 3 }, { qte: 3, qteProduzida: 2 }, { qte: 3, baixaSetores: { CORTE: { qtd: 3 } } }];
  for (const c of casos) expect(calcularProntidao(conj({ marca: 'X', ...c })).pronto).toBe(croquiCortado(c));
});
it('o select da prontidão traz os campos que a regra lê', () => {
  for (const k of ['qte', 'qteProduzida', 'corteConcluidoEm', 'baixaSetores']) expect(CROQUI_PRONTIDAO_SELECT[k]).toBe(true);
});
