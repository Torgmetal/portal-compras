import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma as db} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:db,prismaDirect:db}));
vi.mock('@/lib/fila-setor',()=>({filasSemProgramacao:vi.fn().mockResolvedValue({})}));
vi.mock('@/lib/produzido-setor',()=>({lerProduzidoPorSetor:vi.fn().mockResolvedValue(()=>5)}));
import {lotesProgramados} from '@/lib/gantt-pcp';
let p,d;
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
 p={id:'p',qte:10,pesoTotalKg:1000,marca:'M',op:{numero:'115'},corteDiaProgramado:new Date('2026-09-09'),maquina:'A'};
 d={pecaId:'p',setor:'CORTE',quantidade:10,ancoraDia:p.corteDiaProgramado,ancoraRecurso:'A',partes:[{inicio:0,quantidade:4,dia:'2026-09-09',recurso:'A'},{inicio:4,quantidade:4,dia:'2026-09-10',recurso:'B'},{inicio:8,quantidade:2,dia:null,recurso:null}]};
 db.pecaConjunto.findMany.mockImplementation(async({where})=>where.corteDiaProgramado?[p]:[]);
 db.ganttDistribuicao.findMany.mockResolvedValue([d]);db.romaneioTerceiro.findMany.mockResolvedValue([]);db.liberacaoProducao.findMany.mockResolvedValue([]);db.grdLiberacao.findMany.mockResolvedValue([]);db.oP.findMany.mockResolvedValue([]);
});
it('relê todas faixas incluindo fila, sem duplicar progresso ou peso',async()=>{
 const ls=await lotesProgramados();const itens=ls.flatMap(l=>l.itens);
 expect(itens.reduce((s,i)=>s+i.q,0)).toBe(10);expect(itens.reduce((s,i)=>s+(i.f||0),0)).toBe(5);expect(ls.reduce((s,l)=>s+l.kg,0)).toBe(1000);
 expect(ls.find(l=>l.fila).itens[0]).toMatchObject({id:'p',inicioUnidade:8,q:2,qTotal:10});vi.useRealTimers();
});
it('saldo vencido recebe intervalo diferente da parte já feita',async()=>{
 d.partes=[{inicio:0,quantidade:10,dia:'2026-09-09',recurso:'A'}];
 const ls=await lotesProgramados();expect(ls.flatMap(l=>l.itens).map(i=>[i.inicioUnidade,i.q,i.f||0])).toEqual([[0,5,5],[5,5,0]]);vi.useRealTimers();
});
it('relê OP115 em dez dias sem arredondar peso/custo nem mudar faixa de peso unitário',async()=>{
 const {lerProduzidoPorSetor}=await import('@/lib/produzido-setor');lerProduzidoPorSetor.mockResolvedValueOnce(()=>0);
 const pecas=[{id:'a1',marca:'T115A1',qte:44,pesoTotalKg:5777},{id:'a2',marca:'T115A2',qte:6,pesoTotalKg:322}].map(x=>({...x,op:{numero:'115'},soldaDiaProgramado:new Date('2026-09-10'),soldaBancada:'SOLDA 2'}));
 const partes1=[5,5,5,5,5,5,5,5,4].map((quantidade,i)=>({inicio:5*i,quantidade,dia:`2026-09-${10+i}`,recurso:'SOLDA 2'}));
 const partes2=[{inicio:0,quantidade:1,dia:'2026-09-18',recurso:'SOLDA 2'},{inicio:1,quantidade:5,dia:'2026-09-19',recurso:'SOLDA 2'}];
 db.pecaConjunto.findMany.mockImplementation(async({where})=>where.soldaDiaProgramado?pecas:[]);
 db.ganttDistribuicao.findMany.mockResolvedValue(pecas.map((p,i)=>({pecaId:p.id,setor:'SOLDA',quantidade:p.qte,ancoraDia:p.soldaDiaProgramado,ancoraRecurso:p.soldaBancada,partes:i?partes2:partes1})));
 const ls=await lotesProgramados();const itens=ls.flatMap(l=>l.itens);
 expect(itens.reduce((s,i)=>s+i.q,0)).toBe(50);
 expect(itens.reduce((s,i)=>s+i.kg,0)).toBeCloseTo(6099,10);
 expect(itens.reduce((s,i)=>s+i.c,0)).toBeCloseTo(9.4,10);
 for(const i of itens){const p=pecas.find(p=>p.id===i.id);expect(i.kg/i.q).toBeCloseTo(p.pesoTotalKg/p.qte,10);}
 vi.useRealTimers();
});
it('conserva peso e custo também nos totais dos lotes usados para capacidade',async()=>{
 const {lerProduzidoPorSetor}=await import('@/lib/produzido-setor');lerProduzidoPorSetor.mockResolvedValueOnce(()=>0);
 const p={id:'leve',marca:'LEVE',op:{numero:'115'},qte:4,pesoTotalKg:1.6,soldaDiaProgramado:new Date('2026-09-10'),soldaBancada:'SOLDA 2'};
 db.pecaConjunto.findMany.mockImplementation(async({where})=>where.soldaDiaProgramado?[p]:[]);
 db.ganttDistribuicao.findMany.mockResolvedValue([{pecaId:p.id,setor:'SOLDA',quantidade:p.qte,ancoraDia:p.soldaDiaProgramado,ancoraRecurso:p.soldaBancada,partes:Array.from({length:4},(_,i)=>({inicio:i,quantidade:1,dia:`2026-09-${10+i}`,recurso:'SOLDA 2'}))}]);
 const ls=await lotesProgramados();
 expect(ls.reduce((s,l)=>s+l.kg,0)).toBeCloseTo(1.6,10);
 expect(ls.reduce((s,l)=>s+l.custo,0)).toBeCloseTo(4/53,10);
 vi.useRealTimers();
});
it('programação antiga de croqui não reaparece no Jato sem bancada',async()=>{
 db.pecaConjunto.findMany.mockImplementation(async({where})=>where.jatoDiaProgramado?[{...p,tipoPeca:'CROQUI',jatoDiaProgramado:new Date('2026-09-10'),jatoBancada:null}]:[]);
 db.ganttDistribuicao.findMany.mockResolvedValue([]);
 expect(await lotesProgramados()).toEqual([]);vi.useRealTimers();
});
it('componente rotulado CONJUNTO não reaparece como avulsa no Jato',async()=>{
 db.pecaConjunto.findMany.mockImplementation(async({where})=>where.jatoDiaProgramado?[{...p,tipoPeca:'CONJUNTO',_count:{croquiConjuntos:5},jatoDiaProgramado:new Date('2026-09-10'),jatoBancada:null}]:[]);
 db.ganttDistribuicao.findMany.mockResolvedValue([]);
 expect(await lotesProgramados()).toEqual([]);vi.useRealTimers();
});
