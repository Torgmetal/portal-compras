import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma as db} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:db,prismaDirect:db}));
import {aplicarRemanejo} from '@/lib/gantt-pcp';
const p={id:'p',qte:44,marca:'T115A1',corteDiaProgramado:new Date('2026-09-10'),maquina:'A'};
const b=(inicio,quantidade,dia='2026-09-11')=>({setor:'CORTE',ids:['p'],fracoes:[{id:'p',inicio,quantidade}],dia,recurso:'B'});
beforeEach(()=>{vi.clearAllMocks();db.$transaction.mockImplementation(fn=>fn(db));db.pecaConjunto.findMany.mockResolvedValue([p]);db.ganttDistribuicao.findMany.mockResolvedValue([]);db.pecaConjunto.updateMany.mockResolvedValue({count:1});db.auditLog.create.mockResolvedValue({});});
it('persiste duas faixas do mesmo id e audita antes/depois',async()=>{
 await aplicarRemanejo([b(0,4),b(4,4,'2026-09-12')],{id:'u'});
 const d=db.ganttDistribuicao.upsert.mock.calls.at(-1)[0].create;
 expect(d.partes.map(x=>[x.inicio,x.quantidade,x.dia])).toEqual([[0,4,'2026-09-11'],[4,4,'2026-09-12'],[8,36,'2026-09-10']]);
 expect(db.auditLog.create.mock.calls.at(-1)[0].data.diff).toHaveProperty('antes');
});
it('valida todas as faixas antes da primeira escrita',async()=>{
 await expect(aplicarRemanejo([b(0,4),b(43,2)],{})).rejects.toThrow(/faixa|quantidade/i);
 expect(db.pecaConjunto.updateMany).not.toHaveBeenCalled();
});
it('protocolo legado substitui distribuição',async()=>{
 const x=b(0,44);delete x.fracoes;await aplicarRemanejo([x],{});
 expect(db.ganttDistribuicao.deleteMany).toHaveBeenCalled();
});
it('remanejar uma faixa após recarregar preserva as demais',async()=>{
 db.ganttDistribuicao.findMany.mockResolvedValue([{pecaId:'p',setor:'CORTE',quantidade:44,ancoraDia:p.corteDiaProgramado,ancoraRecurso:'A',partes:[{inicio:0,quantidade:4,dia:'2026-09-11',recurso:'B'},{inicio:4,quantidade:40,dia:'2026-09-10',recurso:'A'}]}]);
 await aplicarRemanejo([b(1,2,'2026-09-15')],{id:'u'});
 const partes=db.ganttDistribuicao.upsert.mock.calls.at(-1)[0].create.partes;
 expect(partes).toEqual([{inicio:0,quantidade:1,dia:'2026-09-11',recurso:'B'},{inicio:1,quantidade:2,dia:'2026-09-15',recurso:'B'},{inicio:3,quantidade:1,dia:'2026-09-11',recurso:'B'},{inicio:4,quantidade:40,dia:'2026-09-10',recurso:'A'}]);
});
it('não confirma salvamento se auditoria falhar',async()=>{
 db.auditLog.create.mockRejectedValueOnce(new Error('auditoria indisponível'));
 await expect(aplicarRemanejo([b(0,4)],{id:'u'})).rejects.toThrow('auditoria indisponível');
});
it('recusa ids incompatíveis com faixas antes de alterar programação',async()=>{
 await expect(aplicarRemanejo([{...b(0,4),fracoes:[{id:'outra',inicio:0,quantidade:4}]}],{})).rejects.toThrow(/incompatíveis/);
 expect(db.pecaConjunto.updateMany).not.toHaveBeenCalled();
});
it('traduz conflito de programação sem repetir a tentativa de escrita',async()=>{
 db.auditLog.create.mockRejectedValueOnce(Object.assign(new Error('Transaction conflict'),{code:'P2034'}));
 await expect(aplicarRemanejo([b(0,4)],{id:'u'})).rejects.toThrow(/outra pessoa|concorrente/i);
 expect(db.pecaConjunto.updateMany).toHaveBeenCalledTimes(2); // destino e primeiro dia original
});
for (const fracionado of [false,true]) it(`salva 300 marcas inteiras em lote (${fracionado?'faixas':'legado'}) sem uma escrita por marca`,async()=>{
 const pecas=Array.from({length:300},(_,i)=>({...p,id:`p${i}`,qte:1,corteDiaOriginal:p.corteDiaProgramado}));
 db.pecaConjunto.findMany.mockResolvedValue(pecas);
 db.pecaConjunto.updateMany.mockImplementation(async({where})=>({count:where.id.in.length}));
 const bloco={...b(0,1),ids:pecas.map(p=>p.id)};
 if(fracionado)bloco.fracoes=pecas.map(p=>({id:p.id,inicio:0,quantidade:1}));else delete bloco.fracoes;
 const r=await aplicarRemanejo([bloco],{id:'u'});
 expect(r.total).toBe(300);
 expect(db.pecaConjunto.updateMany.mock.calls.length).toBeLessThanOrEqual(2);
 expect(db.pecaConjunto.updateMany.mock.calls[0][0].where.id.in).toHaveLength(300);
 expect(db.ganttDistribuicao.upsert).not.toHaveBeenCalled();
 expect(db.ganttDistribuicao.deleteMany).toHaveBeenCalledTimes(1);
 expect(db.ganttDistribuicao.deleteMany.mock.calls[0][0].where.OR).toEqual([{setor:'CORTE',pecaId:{in:pecas.map(p=>p.id)}}]);
});
