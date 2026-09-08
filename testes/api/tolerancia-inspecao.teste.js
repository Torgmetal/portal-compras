import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'u'})}));
vi.mock('@/lib/relatorio-inspecao',()=>({vincularNoDataBook:vi.fn()}));
vi.mock('@/lib/relatorio-dimensional',()=>({garantirDesenhos:vi.fn().mockResolvedValue([])}));
import {PATCH,GET} from '@/app/api/qualidade/inspecoes/[id]/route';
beforeEach(()=>{vi.clearAllMocks();mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);mockPrisma.auditLog.create.mockResolvedValue({});});
it.each(['DIMENSIONAL','PRE_MONTAGEM'])('salva e reabre a tolerância no relatório %s sem alterar as medidas',async tipo=>{
 let rel={id:'r',tipo,linhas:[{letra:'A',marca:'C1',projetoMm:100,encontradoMm:104,tolerancia:'± 3',ax:10,ay:10,bx:30,by:10}],equipamentos:[]};
 mockPrisma.relatorioInspecao.findUnique.mockImplementation(async()=>rel);mockPrisma.relatorioInspecao.update.mockImplementation(async({data})=>(rel={...rel,...data}));
 const linhas=rel.linhas.map(l=>({...l,tolerancia:'± 5'}));const r=await PATCH(new Request('http://localhost/api/qualidade/inspecoes/r',{method:'PATCH',body:JSON.stringify({linhas})}),{params:{id:'r'}});expect(r.status).toBe(200);
 const reaberto=await GET(null,{params:{id:'r'}});expect((await reaberto.json()).relatorio.linhas[0]).toMatchObject({tolerancia:'± 5',projetoMm:100,encontradoMm:104,ax:10,bx:30});
});
it('mantém o bloqueio de relatórios enviados para assinatura',async()=>{
 mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({id:'r',envioAssinaturaId:'assinado'});const r=await PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({linhas:[{tolerancia:'± 5'}]})}),{params:{id:'r'}});expect(r.status).toBe(409);expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();
});
