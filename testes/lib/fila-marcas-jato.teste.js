import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma,prismaDirect:mockPrisma}));
vi.mock('@/lib/fora-da-fabrica',()=>({pecasNoTerceiro:vi.fn().mockResolvedValue(new Set())}));
const feitos=vi.hoisted(()=>new Map());
vi.mock('@/lib/produzido-setor',()=>({lerProduzidoPorSetor:async()=>((p,setor)=>feitos.get(`${p.marca}|${setor}`)||0)}));
import {filaDoSetor,filasSemProgramacao} from '@/lib/fila-setor';
const peca=(marca,tipoPeca=null,croquis=0)=>({id:marca,opId:'op112',op:{numero:'112'},marca,tipoPeca,qte:2,pesoTotalKg:100,perfil:'UE200',_count:{conjuntoCroquis:croquis},qteProduzida:0});
let pecas;
beforeEach(()=>{
 vi.clearAllMocks();feitos.clear();
 pecas=[peca('T112A51'),peca('T112A52'),peca('C1','CONJUNTO',2),peca('P1','CROQUI'),peca('SOLO','CONJUNTO')];
 for(const p of pecas)feitos.set(`${p.marca}|CORTE`,2);
 feitos.set('T112A52|JATO',2);
 mockPrisma.pecaConjunto.findMany.mockImplementation(async({where})=>where.conjuntoCroquis?[]:pecas);
 mockPrisma.mesOrdem.findMany.mockResolvedValue([]);mockPrisma.oP.findMany.mockResolvedValue([{id:'op112'}]);
});
it('marca cortada entra direto na fila do Jato; conjunto aguarda Acabamento e croqui fica no Corte',async()=>{
 const r=await filaDoSetor('JATO');
 expect(r.fila.map(p=>p.marca)).toEqual(['SOLO','T112A51']);
});
it('a fila do Gantt aplica a mesma rota às OPs já liberadas',async()=>{
 const r=await filasSemProgramacao();
 expect(r.JATO.map(p=>p.marca).sort()).toEqual(['SOLO','T112A51']);
});
it('reconhece corte concluído no portal antes da sincronização do Syneco',async()=>{
 feitos.clear();pecas=[{...peca('T112A51'),qteProduzida:2}];
 expect((await filaDoSetor('JATO')).fila.map(p=>p.marca)).toEqual(['T112A51']);
 const filas=await filasSemProgramacao();
 expect(filas.JATO.map(p=>p.marca)).toEqual(['T112A51']);
 expect(filas.CORTE).toEqual([]);
});
it('marca sem subpeças ainda não cortada aguarda no Corte mesmo rotulada como conjunto',async()=>{
 feitos.clear();pecas=[peca('SOLO','CONJUNTO')];
 const filas=await filasSemProgramacao();
 expect(filas.CORTE.map(p=>p.marca)).toEqual(['SOLO']);
 expect(filas.JATO).toEqual([]);
});
it('não encaminha ao Jato marca com corte ainda incompleto',async()=>{
 feitos.clear();pecas=[{...peca('T112A51'),qteProduzida:1}];
 expect((await filaDoSetor('JATO')).fila).toEqual([]);
});
it('não oferece na fila da Solda peça terceirizada sem recebimento, mesmo com montagem apontada',async()=>{
 pecas=[{...peca('C1','CONJUNTO',2),terceirizado:true,terceirizadoRecebidoEm:null}];
 feitos.set('C1|MONTAGEM',2);
 expect((await filasSemProgramacao()).SOLDA).toEqual([]);
});
it('não reintroduz terceiro sem recebimento pelo apontamento parcial de bancada',async()=>{
 pecas=[{...peca('C1','CONJUNTO',2),terceirizado:true,terceirizadoRecebidoEm:null}];
 mockPrisma.mesOrdem.findMany.mockResolvedValue([{opId:'op112',item:'C1',setor:'Solda',saldoUn:1}]);
 expect((await filasSemProgramacao()).SOLDA).toEqual([]);
});
it('volta a oferecer a peça na Solda após recebimento',async()=>{
 pecas=[{...peca('C1','CONJUNTO',2),terceirizado:true,terceirizadoRecebidoEm:new Date('2026-09-09')}];
 feitos.set('C1|MONTAGEM',2);
 expect((await filasSemProgramacao()).SOLDA.map(p=>p.id)).toEqual(['C1']);
});
it('ordem aberta no Syneco não recoloca croqui nas filas posteriores ao Corte',async()=>{
 pecas=[peca('P1','CROQUI')];
 mockPrisma.mesOrdem.findMany.mockResolvedValue([{opId:'op112',item:'P1',setor:'Jato',saldoUn:2}]);
 const filas=await filasSemProgramacao();
 expect(filas.JATO).toEqual([]);
});
