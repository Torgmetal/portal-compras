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
it('pré-programação lista conjuntos com corte pendente, mas exclui marcas sem subpeças',async()=>{
 const r=await GET(new Request('http://localhost/api/pcp/despacho?opId=op94&setor=MONTAGEM&preprogramar=1'));
 expect(r.status).toBe(200);const j=await r.json();expect(j.pecas.map(p=>p.id)).toEqual(['c1','c2','c3']);
});
it('consulta normal mantém o recorte de liberação',async()=>{
 const r=await GET(new Request('http://localhost/api/pcp/despacho?opId=op94&setor=MONTAGEM'));
 expect((await r.json()).pecas.map(p=>p.id)).toEqual(['c1','c2']);
});
vi.mock('@/lib/pcp-conferencias-decisao',()=>({conferirDecisaoPcp:vi.fn().mockResolvedValue({porId:{}})}));
import {conferirDecisaoPcp} from '@/lib/pcp-conferencias-decisao';
it('fila de decisão ignora tentativas de ampliar o recorte por query string',async()=>{
 const r=await GET(new Request('http://localhost/api/pcp/despacho?opId=op94&setor=MONTAGEM&decisao=1&tudo=1&preprogramar=1'));
 expect((await r.json()).pecas.map(p=>p.id)).toEqual(['c1','c2']);
});
it('fila de decisão sem liberação ativa fica vazia',async()=>{
 mockPrisma.liberacaoProducao.findMany.mockResolvedValue([]);
 const r=await GET(new Request('http://localhost/api/pcp/despacho?opId=op94&setor=MONTAGEM&decisao=1'));
 expect((await r.json()).pecas).toEqual([]);
});
it('ponteiros perdidos não transformam o lote em uma liberação da OP inteira',async()=>{
 mockPrisma.liberacaoProducao.findMany.mockResolvedValue([{id:'l1',pecaIds:['apagada'],dataProgramada:null}]);
 const r=await GET(new Request('http://localhost/api/pcp/despacho?opId=op94&setor=MONTAGEM&decisao=1'));
 expect((await r.json()).pecas).toEqual([]);
});
it('recupera marcas liberadas após reimportação da lista',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue(conjuntos.map(p=>({...p,opNumero:'T94'})));
 mockPrisma.liberacaoProducao.findMany.mockResolvedValue([{id:'l1',pecaIds:['apagada'],pecaMarcas:['T94|C2'],dataProgramada:null}]);
 const r=await GET(new Request('http://localhost/api/pcp/despacho?opId=op94&setor=MONTAGEM&decisao=1'));
 expect((await r.json()).pecas.map(p=>p.id)).toEqual(['c2']);
});
it('falha no Syneco invalida recomendação de prontidão sem derrubar consulta antiga',async()=>{
 mockPrisma.mesOrdem.groupBy.mockRejectedValue(new Error('indisponível'));
 await GET(new Request('http://localhost/api/pcp/despacho?opId=op94&setor=MONTAGEM&decisao=1'));
 expect(conferirDecisaoPcp.mock.calls.at(-1)[0].dadosCompletos).toBe(false);
});
