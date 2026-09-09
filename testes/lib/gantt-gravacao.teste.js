import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma as db} from '@/testes/apoio/prisma';
const transacao=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:new Proxy(db,{get:(_,chave)=>chave==='$transaction'?transacao.run:db[chave]}),prismaDirect:db}));
import {aplicarRemanejo} from '@/lib/gantt-pcp';
const bloco=(ids,dia='2026-09-10')=>({setor:'SOLDA',ids,recurso:'SOLDA 1',dia});
beforeEach(()=>{vi.clearAllMocks();transacao.run.mockImplementation(fn=>fn(db));db.pecaConjunto.findMany.mockResolvedValue([{id:'p1'},{id:'p2'}]);db.pecaConjunto.updateMany.mockImplementation(async x=>({count:x.where.id.in.length}));});
it('grava somente o destino final de cada peça sem repetir movimentos intermediários',async()=>{
 const r=await aplicarRemanejo([bloco(['p1','p2','p1']),bloco(['p1'],'2026-09-11')],{name:'PCP'});
 expect(r.total).toBe(2);
 const escritas=db.pecaConjunto.updateMany.mock.calls.map(([x])=>x);
 expect(escritas.filter(x=>x.where.id.in.includes('p1'))).toHaveLength(1);
 expect(escritas.find(x=>x.where.id.in.includes('p1')).data.soldaDiaProgramado).toEqual(new Date('2026-09-11'));
});
it('recusa seleção com peça removida antes de gravar qualquer destino',async()=>{
 db.pecaConjunto.findMany.mockResolvedValue([{id:'p1'}]);
 await expect(aplicarRemanejo([bloco(['p1']),bloco(['removida'])],{})).rejects.toThrow(/atualiz|encontr|remov/i);
 expect(db.pecaConjunto.updateMany).not.toHaveBeenCalled();
});

it('usa o cliente transacional para todas as escritas e desfaz o primeiro bloco se o segundo falhar',async()=>{
 const estado={p1:'2026-09-09',p2:'2026-09-09'};const original={...estado};let escritas=0;
 const tx={pecaConjunto:{findMany:vi.fn().mockResolvedValue([{id:'p1'},{id:'p2'}]),updateMany:vi.fn(async({where,data})=>{if(++escritas===2)throw Error('falha no segundo bloco');for(const id of where.id.in)estado[id]=data.soldaDiaProgramado.toISOString().slice(0,10);return {count:where.id.in.length};})}};
 transacao.run.mockImplementation(async fn=>{try{return await fn(tx);}catch(e){Object.assign(estado,original);throw e;}});
 await expect(aplicarRemanejo([bloco(['p1']),bloco(['p2'],'2026-09-11')],{})).rejects.toThrow('segundo bloco');
 expect(escritas).toBe(2);expect(estado).toEqual(original);expect(db.pecaConjunto.updateMany).not.toHaveBeenCalled();
});
