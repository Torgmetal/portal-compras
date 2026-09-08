import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
const mocks=vi.hoisted(()=>({role:vi.fn()}));
vi.mock('@/lib/session',()=>({requireRole:mocks.role}));
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma,prismaDirect:mockPrisma}));
vi.mock('@/lib/conjuntos-setor',()=>({produzidoPorMarca:vi.fn().mockResolvedValue({})}));
import {POST} from '@/app/api/planejamento/montagem/route';
const pecas=[{id:'c1',opId:'op1',opNumero:'T097A',marca:'C1',qte:2,pesoTotalKg:100},{id:'c2',opId:'op1',opNumero:'T097B',marca:'C2',qte:3,pesoTotalKg:200}];
const req=body=>new Request('http://localhost/api/planejamento/montagem',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.role.mockResolvedValue({id:'user1',name:'Planejamento'});mockPrisma.pecaConjunto.findMany.mockResolvedValue(pecas);mockPrisma.liberacaoProducao.findMany.mockResolvedValue([]);mockPrisma.oP.findUnique.mockResolvedValue({numero:'097'});mockPrisma.liberacaoProducao.create.mockImplementation(async({data})=>({id:'lib-'+data.frente,...data}));});
describe('liberação de montagem sem agendar',()=>{
 it('libera por OP e frente sem alterar datas ou bancadas',async()=>{
  const r=await POST(req({acao:'liberar',opId:'op1',ids:['c1','c2']}));expect(r.status).toBe(200);
  expect((await r.json()).atualizados).toBe(2);expect(mockPrisma.liberacaoProducao.create).toHaveBeenCalledTimes(2);
  const d=mockPrisma.liberacaoProducao.create.mock.calls.map(([a])=>a.data);
  expect(d[0]).toMatchObject({opId:'op1',frente:'T097A',dataProgramada:null,setores:['MONTAGEM'],totalPecas:2,totalKg:100,pecaMarcas:['T097A|C1']});
  expect(d[1].pecaIds).toEqual(['c2']);expect(mockPrisma.pecaConjunto.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.auditLog.create).toHaveBeenCalled();
 });
 it('não duplica peças já liberadas, inclusive reimportadas com novo id',async()=>{
  mockPrisma.liberacaoProducao.findMany.mockResolvedValue([{pecaIds:['antigo'],pecaMarcas:['T097A|C1']}]);
  const r=await POST(req({acao:'liberar',opId:'op1',ids:['c1','c2']}));expect(r.status).toBe(200);expect((await r.json()).atualizados).toBe(1);
  expect(mockPrisma.liberacaoProducao.create).toHaveBeenCalledTimes(1);expect(mockPrisma.liberacaoProducao.create.mock.calls[0][0].data.pecaIds).toEqual(['c2']);
 });
 it('reconhece a liberação antiga da frente inteira sem bloquear outra frente',async()=>{
  mockPrisma.liberacaoProducao.findMany.mockResolvedValue([{frente:'T097A',pecaIds:null,pecaMarcas:null}]);
  const r=await POST(req({acao:'liberar',opId:'op1',ids:['c1','c2']}));expect(r.status).toBe(200);expect((await r.json()).atualizados).toBe(1);
  expect(mockPrisma.liberacaoProducao.create).toHaveBeenCalledTimes(1);expect(mockPrisma.liberacaoProducao.create.mock.calls[0][0].data.frente).toBe('T097B');
 });
 it('repetir a liberação não altera lotes nem cria avisos duplicados',async()=>{
  mockPrisma.liberacaoProducao.findMany.mockResolvedValue([{pecaIds:['c1','c2']}]);
  const r=await POST(req({acao:'liberar',opId:'op1',ids:['c1','c2']}));expect(r.status).toBe(200);expect((await r.json()).atualizados).toBe(0);expect(mockPrisma.liberacaoProducao.create).not.toHaveBeenCalled();
 });
 it('rejeita seleção vazia e sem OP antes de consultar dados',async()=>{
  expect((await POST(req({acao:'liberar',ids:[]}))).status).toBe(400);expect(mockPrisma.pecaConjunto.findMany).not.toHaveBeenCalled();
 });
 it('preserva as permissões de acesso',async()=>{mocks.role.mockRejectedValue(new Error('Forbidden'));expect((await POST(req({acao:'liberar',opId:'op1',ids:['c1']}))).status).toBe(403);expect(mockPrisma.liberacaoProducao.create).not.toHaveBeenCalled();});
});
