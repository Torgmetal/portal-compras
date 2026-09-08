import { beforeEach, expect, it, vi } from 'vitest';
import { mockPrisma } from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
import { buscarFardosCompativeis } from '@/lib/fardos-compativeis';
const nomes = ['CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 9,50MM', 'CHAPA A36 9.50MM', 'CHAPA A36 16MM'];
beforeEach(() => vi.resetAllMocks());
it('inclui todos os Rs de descrições compatíveis e outras OPs, sem os limites de 12 e 400', async () => {
  const linhas = Array.from({length: 450}, (_, i) => ({id: String(i), importRef: String(260000+i), nome: nomes[i%2], opNumero: i%2 ? '097' : '113', pesoKg: 100, dataRecebimento: new Date('2026-09-01')}));
  mockPrisma.documentoQualidade.findMany.mockResolvedValueOnce(nomes.map(nome => ({nome}))).mockResolvedValueOnce(linhas);
  const resultado = await buscarFardosCompativeis('CH9.50');
  expect(resultado).toHaveLength(450);
  expect(resultado[449]).toMatchObject({r: '260449', descricao: nomes[1], opNumero: '097', pesoKg: 100});
  const consulta = mockPrisma.documentoQualidade.findMany.mock.calls[1][0];
  expect(consulta.where.nome.in).toEqual(nomes.slice(0,2));
  expect(consulta.where.opNumero).toBeUndefined();
  expect(consulta.take).toBeUndefined();
});
it('não consulta fardos quando nenhum material é compatível', async () => {
  mockPrisma.documentoQualidade.findMany.mockResolvedValueOnce([{nome: nomes[2]}]);
  expect(await buscarFardosCompativeis('CH9.50')).toEqual([]);
  expect(mockPrisma.documentoQualidade.findMany).toHaveBeenCalledTimes(1);
});
