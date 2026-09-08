import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
const mocks=vi.hoisted(()=>({padronizar:vi.fn(),acesso:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/sharepoint',()=>({getAccessToken:async()=>'token-de-teste'}));
vi.mock('@/lib/portal-cliente',()=>({secoesDoPortal:()=>['DOCUMENTOS'],tipoDoDocEng:()=>true,portalExpirado:()=>false}));
vi.mock('@/lib/portal-acesso',()=>({registrarAcesso:mocks.acesso}));
vi.mock('@/lib/excel-padronizar',()=>({padronizarPlanilha:mocks.padronizar}));
import {GET} from '@/app/api/portal/[token]/eng/route';
const portal=mostrarPeso=>({id:'p1',status:'PUBLICADO',mostrarPeso,docsPorArea:{ENGENHARIA:[{id:'d1',nome:'lista.xlsx'}]}});
beforeEach(()=>vi.resetAllMocks());
it.each(['recusa','falha'])('não entrega arquivo original sem autorização de peso quando a transformação %s',async(tipo)=>{
 mockPrisma.portalCliente.findUnique.mockResolvedValue(portal(false));
 if(tipo==='falha')mocks.padronizar.mockRejectedValue(new Error('falha de leitura'));else mocks.padronizar.mockResolvedValue(null);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('arquivo original com peso')));
 try{const r=await GET(new Request('http://localhost/api/portal/teste/eng?id=d1'),{params:{token:'teste'}});expect(r.status).toBe(422);expect(await r.text()).not.toContain('arquivo original');expect(mocks.acesso).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}
});
it('mantém o original complexo quando peso está autorizado',async()=>{
 mockPrisma.portalCliente.findUnique.mockResolvedValue(portal(true));mocks.padronizar.mockResolvedValue(null);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('arquivo original autorizado')));
 try{const r=await GET(new Request('http://localhost/api/portal/teste/eng?id=d1'),{params:{token:'teste'}});expect(r.status).toBe(200);expect(await r.text()).toBe('arquivo original autorizado');}finally{vi.unstubAllGlobals();}
});
