import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma as db} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:db,prismaDirect:db}));
vi.mock('@/lib/produzido-setor',()=>({lerProduzidoPorSetor:vi.fn(async()=>()=>3)}));
import {listaDoPosto} from '@/lib/lista-posto';
beforeEach(()=>{vi.clearAllMocks();db.pecaConjunto.findMany.mockResolvedValue([{id:'p',qte:10,pesoTotalKg:1000,marca:'M',montagemDiaProgramado:new Date('2026-09-10'),montagemBancada:'A'}]);db.ganttDistribuicao.findMany.mockResolvedValue([{pecaId:'p',setor:'MONTAGEM',quantidade:10,ancoraDia:new Date('2026-09-10'),ancoraRecurso:'A',partes:[{inicio:0,quantidade:4,dia:'2026-09-10',recurso:'A'},{inicio:4,quantidade:6,dia:'2026-09-11',recurso:'B'}]}]);});
it('lista outra bancada/dia só com quantidade efetiva e progresso não repetido',async()=>{
 const r=await listaDoPosto('MONTAGEM','B','2026-09-11','2026-09-11');
 expect(r.linhas).toHaveLength(1);expect(r.linhas[0]).toMatchObject({qte:6,feito:0,saldo:6,kg:600,dia:'2026-09-11'});
});
it('mantém filtro de OP viva ao incluir peças com distribuição em outro posto',async()=>{
 const {OP_VIVA}=await import('@/lib/op-viva');
 await listaDoPosto('MONTAGEM','B','2026-09-11','2026-09-11');
 const filtro=db.pecaConjunto.findMany.mock.calls[0][0].where;
 expect(filtro.AND).toContainEqual(OP_VIVA);
 expect(filtro.AND).toContainEqual({OR:[{montagemBancada:'B',montagemDiaProgramado:{gte:new Date('2026-09-11'),lt:new Date('2026-09-12')}},{id:{in:['p']}}]});
});
it('soma peso fracionado sem arredondar cada faixa para zero',async()=>{
 db.pecaConjunto.findMany.mockResolvedValue([{id:'p',qte:4,pesoTotalKg:1.6,marca:'M',montagemDiaProgramado:new Date('2026-09-10'),montagemBancada:'A'}]);
 db.ganttDistribuicao.findMany.mockResolvedValue([{pecaId:'p',setor:'MONTAGEM',quantidade:4,ancoraDia:new Date('2026-09-10'),ancoraRecurso:'A',partes:Array.from({length:4},(_,i)=>({inicio:i,quantidade:1,dia:`2026-09-${10+i}`,recurso:'A'}))}]);
 const {lerProduzidoPorSetor}=await import('@/lib/produzido-setor');lerProduzidoPorSetor.mockResolvedValueOnce(()=>0);
 const r=await listaDoPosto('MONTAGEM','A','2026-09-10','2026-09-13');
 expect(r.linhas.map(l=>l.kg)).toEqual([0.4,0.4,0.4,0.4]);expect(r.total.kg).toBeCloseTo(1.6,10);
});
it('lista de bancada não inclui componente com tipo legado incorreto após o Corte',async()=>{
 db.pecaConjunto.findMany.mockResolvedValue([{id:'p',marca:'T113A-P13',qte:18,pesoTotalKg:200.81,tipoPeca:'CONJUNTO',_count:{croquiConjuntos:5},jatoDiaProgramado:new Date('2026-09-10'),jatoBancada:'JATO_MANUAL'}]);
 db.ganttDistribuicao.findMany.mockResolvedValue([]);
 expect((await listaDoPosto('JATO','JATO_MANUAL','2026-09-10','2026-09-10')).linhas).toEqual([]);
});
