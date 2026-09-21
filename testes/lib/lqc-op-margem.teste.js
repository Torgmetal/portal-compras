import { expect, it } from 'vitest';
import { margemOrcadaLqc } from '@/lib/lqc-op-margem';

const op = {
  estudoDados: { origem: 'LQC_PORTAL', codigo: 'LQC-teste', resultado: { custo: 700, custosExternos: 400 }, composicao: { bdi: { impostos: 10, factoring: 3, administracao: 0, seguro: 0, risco: 0, comissoes: 0 } } },
  receitas: [{ valor: 1000, aditivoId: null }], itens: [], aditivos: [],
};
it('preserva OPs anteriores sem aplicar a nova margem', () => {
  expect(margemOrcadaLqc({ ...op, estudoDados: {} })).toBeNull();
});
it('desconta custo completo e reservas sobre o contrato negociado', () => {
  expect(margemOrcadaLqc(op)).toMatchObject({ valido: true, receita: 1000, compras: 400, internos: 300, impostos: 100, financeiro: 30, margem: 170, margemPct: 17 });
});
it('não mistura aditivos com os custos do contrato base', () => {
  expect(margemOrcadaLqc({ ...op, receitas: [...op.receitas, { valor: 500, aditivoId: 'aditivo' }] }).receita).toBe(1000);
});
it('respeita o contrato explícito sem aditivos e exige conciliação se houver aditivos', () => {
  expect(margemOrcadaLqc({ ...op, valorTotalContrato: 1200 })).toMatchObject({ receita: 1200, margem: 344 });
  expect(margemOrcadaLqc({ ...op, valorTotalContrato: 1200, aditivos: [{ numero: 1 }] }).valido).toBe(false);
});
it('não trata dados ausentes como custo ou imposto zero', () => {
  expect(margemOrcadaLqc({ ...op, estudoDados: { ...op.estudoDados, resultado: {} } }).valido).toBe(false);
  expect(margemOrcadaLqc({ ...op, estudoDados: { ...op.estudoDados, composicao: { bdi: {} } } }).valido).toBe(false);
});
it('não apresenta margem sem conciliação de faturamento direto', () => {
  expect(margemOrcadaLqc({ ...op, itens: [{ faturamentoDireto: true }] }).valido).toBe(false);
});
it('desconta reservas sobre custo e comissões sobre a receita sem duplicar a meta', () => {
  const bdi = { ...op.estudoDados.composicao.bdi, administracao: 2, seguro: 1, risco: 1, comissoes: 2, margem: 50 };
  expect(margemOrcadaLqc({ ...op, estudoDados: { ...op.estudoDados, composicao: { bdi } } })).toMatchObject({ outrasReservas: 48, margem: 122 });
});
