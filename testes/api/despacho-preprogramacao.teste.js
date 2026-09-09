import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma,prismaDirect:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'pcp'})}));
vi.mock('@/lib/fora-da-fabrica',()=>({pecasNoTerceiro:vi.fn().mockResolvedValue(new Set())}));
vi.mock('@/lib/entregue-expedicao',()=>({marcasEntreguesAExpedicao:vi.fn().mockResolvedValue(new Set()),entregueAExpedicao:()=>false,noRomaneioSemProducao:()=>[]}));
vi.mock('@/lib/status-compra',()=>({materialPorPerfil:vi.fn().mockResolvedValue(new Map()),statusCompraPorOp:vi.fn().mockResolvedValue(new Map())}));
import {GET} from '@/app/api/pcp/despacho/route';
const conjuntos=[1,2,3,4].map(n=>({id:'c'+n,marca:'C'+n,fonte:'LPC_IMPORT',tipoPeca:'CONJUNTO',status:'PENDENTE',qte:1,pesoTotalKg:100,_count:{conjuntoCroquis:n===4?0:1}}));
beforeEach(()=>{
 vi.clearAllMocks();
 mockPrisma.oP.findUnique.mockResolvedValue({numero:'094',emProducao:true});
 mockPrisma.pecaConjunto.findMany.mockResolvedValue(conjuntos);
 mockPrisma.liberacaoProducao.findMany.mockResolvedValue([{id:'l1',pecaIds:['c1','c2'],dataProgramada:null}]);
 for(const [model,method] of [['grdLiberacao','findMany'],['mesOrdem','groupBy'],['mesOrdem','findMany'],['mesApontamento','groupBy'],['romaneioItem','findMany'],['conjuntoCroqui','findMany']])mockPrisma[model][method].mockResolvedValue([]);
});
it('pré-programação lista todos os conjuntos mesmo com apenas dois no lote liberado',async()=>{
 const r=await GET(new Request('http://localhost/api/pcp/despacho?opId=op94&setor=MONTAGEM&preprogramar=1'));
 expect(r.status).toBe(200);const j=await r.json();expect(j.pecas.map(p=>p.id)).toEqual(['c1','c2','c3','c4']);
 expect(j.pecas.find(p=>p.id==='c4').prontoMontar).toBe(false);
});
it('consulta normal mantém o recorte de liberação',async()=>{
 const r=await GET(new Request('http://localhost/api/pcp/despacho?opId=op94&setor=MONTAGEM'));
 expect((await r.json()).pecas.map(p=>p.id)).toEqual(['c1','c2']);
});
