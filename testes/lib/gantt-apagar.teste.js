import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma,prismaDirect:mockPrisma}));
const {apagarProgramacao}=await import('@/lib/gantt-pcp');
const user={id:'u1',name:'Gabriel'};

beforeEach(()=>{
 vi.clearAllMocks();   // o mock e um proxy compartilhado: sem limpar, mock.calls acumula entre testes
 mockPrisma.pecaConjunto.updateMany.mockResolvedValue({count:2});
 mockPrisma.liberacaoProducao.findMany.mockResolvedValue([{id:'l1',pecaIds:['p1','p2','p9']}]);
 mockPrisma.liberacaoProducao.update.mockResolvedValue({});
 mockPrisma.auditLog.create.mockResolvedValue({});
});

describe('apagar programação do Gantt',()=>{
 it('limpa dia e recurso do setor certo',async()=>{
  await apagarProgramacao([{setor:'CORTE',ids:['p1','p2'],dia:'2026-09-09',recurso:'LASER_TUBO'}],user,'revisão do projeto');
  const chamada=mockPrisma.pecaConjunto.updateMany.mock.calls.at(-1)[0];
  expect(chamada.data).toEqual({corteDiaProgramado:null,maquina:null});
  expect(chamada.where).toEqual({id:{in:['p1','p2']}});
 });
 it('na montagem limpa também quem programou e quando',async()=>{
  await apagarProgramacao([{setor:'MONTAGEM',ids:['p1'],dia:'2026-09-09',recurso:'JURANDIR'}],user,'lançamento duplo');
  const c=mockPrisma.pecaConjunto.updateMany.mock.calls.at(-1)[0];
  expect(c.data).toMatchObject({montagemDiaProgramado:null,montagemBancada:null,montagemProgramadaPor:null});
 });
 it('NÃO apaga o dia original — o atraso não pode sumir junto',async()=>{
  await apagarProgramacao([{setor:'CORTE',ids:['p1'],dia:'2026-09-09'}],user,'outro');
  const c=mockPrisma.pecaConjunto.updateMany.mock.calls.at(-1)[0];
  expect(c.data).not.toHaveProperty('corteDiaOriginal');
  expect(c.data).not.toHaveProperty('corteAdiado');
 });
 it('tira o id da liberação — é isso que faz sair da fila',async()=>{
  const r=await apagarProgramacao([{setor:'CORTE',ids:['p1','p2'],dia:'2026-09-09'}],user,'revisão do projeto');
  expect(mockPrisma.liberacaoProducao.update).toHaveBeenCalledWith({where:{id:'l1'},data:{pecaIds:['p9']}});
  expect(r.liberacoesTocadas).toBe(1);
 });
 it('não toca liberação que não continha as peças',async()=>{
  mockPrisma.liberacaoProducao.findMany.mockResolvedValue([{id:'l2',pecaIds:['x1']}]);
  const r=await apagarProgramacao([{setor:'CORTE',ids:['p1'],dia:'2026-09-09'}],user,'outro');
  expect(mockPrisma.liberacaoProducao.update).not.toHaveBeenCalled();
  expect(r.liberacoesTocadas).toBe(0);
 });
 it('ignora id de retorno de terceiro, que não é peça',async()=>{
  const r=await apagarProgramacao([{setor:'CORTE',ids:['retorno:a:b:0'],dia:'2026-09-09'}],user,'outro');
  expect(mockPrisma.pecaConjunto.updateMany).not.toHaveBeenCalled();
  expect(r.total).toBe(0);
 });
 it('registra motivo e marcas na auditoria',async()=>{
  await apagarProgramacao([{setor:'CORTE',ids:['p1'],marcas:['T84A-P2'],dia:'2026-09-09',recurso:null}],user,'programado na máquina errada');
  const log=mockPrisma.auditLog.create.mock.calls.at(-1)[0];
  expect(log.data.action).toBe('PCP_GANTT_APAGAR_PROGRAMACAO');
  expect(log.data.diff.motivo).toBe('programado na máquina errada');
  expect(log.data.diff.marcas).toEqual(['T84A-P2']);
 });
});
