import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma,prismaDirect:mockPrisma}));
vi.mock('server-only',()=>({}));
const {pecasNoTerceiro}=await import('@/lib/fora-da-fabrica');

// GC1 e GC2 foram para o terceiro; GC3 fica aqui. P1/P2 só compõem GC1; P9 compõe GC2 E GC3.
const remessa={status:'ENVIADO',opRefNumero:'097',retornos:[],itens:[{marca:'GC1',qte:1},{marca:'GC2',qte:1}]};
const conjuntos=[
 {id:'c1',marca:'GC1',opNumero:'097',op:{numero:'097'},conjuntoCroquis:[{croquiId:'p1'},{croquiId:'p2'}]},
 {id:'c2',marca:'GC2',opNumero:'097',op:{numero:'097'},conjuntoCroquis:[{croquiId:'p9'}]},
];
const usos=[{croquiId:'p1',conjuntoId:'c1'},{croquiId:'p2',conjuntoId:'c1'},
 {croquiId:'p9',conjuntoId:'c2'},{croquiId:'p9',conjuntoId:'c3'}];

beforeEach(()=>{
 mockPrisma.romaneioTerceiro.findMany.mockResolvedValue([remessa]);
 mockPrisma.pecaConjunto.findMany.mockResolvedValue(conjuntos);
 mockPrisma.conjuntoCroqui.findMany.mockResolvedValue(usos);
});

describe('peças que estão com terceiro',()=>{
 it('leva junto os croquis exclusivos do conjunto — é o que faltava na preparação',async()=>{
  const fora=await pecasNoTerceiro();
  expect([...fora].sort()).toEqual(['c1','c2','p1','p2']);
 });
 it('não tira o croqui que também compõe conjunto que ficou aqui',async()=>{
  expect((await pecasNoTerceiro()).has('p9')).toBe(false); // p9 ainda é trabalho nosso, pelo c3
 });
 it('não consulta peça nenhuma quando não há remessa viva',async()=>{
  mockPrisma.romaneioTerceiro.findMany.mockResolvedValue([]);
  mockPrisma.pecaConjunto.findMany.mockClear();
  expect((await pecasNoTerceiro()).size).toBe(0);
  expect(mockPrisma.pecaConjunto.findMany).not.toHaveBeenCalled();
 });
 it('ignora a marca homônima de outra OP',async()=>{
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([{...conjuntos[0],id:'x',opNumero:'105',op:{numero:'105'}}]);
  expect((await pecasNoTerceiro()).has('x')).toBe(false);
 });
});
