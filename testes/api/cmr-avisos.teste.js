import {it,expect,vi,beforeEach} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'almox'})}));
vi.mock('@/lib/cmr',()=>({CMR_CAT:'MATERIAL',prefixoAno:()=> '26',proximoIndiceR:vi.fn().mockResolvedValue('261234'),mapearLancamento:(l,r)=>({nome:l.descricao,importRef:r}),aprenderReferencias:vi.fn().mockResolvedValue()}));
// ⚠⚠ `lerLinhasCmr` entrou no mock porque a rota passou a CONFERIR o R na planilha antes de
// emitir (22/09/2026). Sem a planilha ela recusa com 503 — foi assim que este teste acusou a
// mudança, e é o comportamento certo: emitir número sem conferir foi metade do defeito do R 261547.
vi.mock('@/lib/cmr-sharepoint',()=>({appendLinhasCmr:vi.fn().mockResolvedValue({}),lerLinhasCmr:vi.fn().mockResolvedValue([])}));
vi.mock('@/lib/cmr-reconciliar',()=>({ehCascaVazia:()=>false}));
vi.mock('@/lib/recebimento-notificacoes',()=>({notificarMateriaisRecebidos:vi.fn().mockResolvedValue()}));
import {notificarMateriaisRecebidos} from '@/lib/recebimento-notificacoes';
import {POST} from '@/app/api/compras/cmr/route';
const req=()=>new Request('http://localhost/api/compras/cmr',{method:'POST',body:JSON.stringify({ano:2026,espelhar:false,lancamentos:[{descricao:'CH 12,5'},{descricao:'W150'}]})});
beforeEach(()=>{vi.clearAllMocks();mockPrisma.documentoQualidade.create.mockImplementation(async({data})=>data)});
it('só avisa depois de salvar os recebimentos',async()=>{
 expect((await POST(req())).status).toBe(200);
 expect(notificarMateriaisRecebidos).toHaveBeenCalledWith([{nome:'CH 12,5',importRef:'261234'},{nome:'W150',importRef:'261235'}],'almox');
 expect(mockPrisma.documentoQualidade.create.mock.invocationCallOrder[1]).toBeLessThan(notificarMateriaisRecebidos.mock.invocationCallOrder[0]);
});
it('falha parcial avisa apenas o R realmente persistido',async()=>{
 mockPrisma.documentoQualidade.create.mockResolvedValueOnce({nome:'CH 12,5',importRef:'261234'}).mockRejectedValueOnce(new Error('Falha'));
 expect((await POST(req())).status).toBe(500);
 expect(notificarMateriaisRecebidos).toHaveBeenCalledWith([{nome:'CH 12,5',importRef:'261234'}],'almox');
});

// ⚠⚠ A RECUSA É DELIBERADA. Sem conseguir ler a planilha o portal NÃO emite R: o lançamento fica
// para daqui a pouco, enquanto um número duplicado contamina o certificado que vai ao cliente e só
// aparece semanas depois.
it('sem a planilha, não emite R — recusa com 503',async()=>{
 const {lerLinhasCmr}=await import('@/lib/cmr-sharepoint');
 lerLinhasCmr.mockRejectedValueOnce(new Error('SharePoint fora do ar'));
 const res=await POST(req());
 expect(res.status).toBe(503);
 expect((await res.json()).error).toMatch(/planilha/i);
 expect(mockPrisma.documentoQualidade.create).not.toHaveBeenCalled();
});

// ⚠ E o R emitido pula o que a planilha já usa — é o que impede dois materiais no mesmo índice.
it('o R emitido considera o que a planilha já ocupa',async()=>{
 const {lerLinhasCmr}=await import('@/lib/cmr-sharepoint');
 const {proximoIndiceR}=await import('@/lib/cmr');
 lerLinhasCmr.mockResolvedValueOnce([{indiceR:'261547'},{indiceR:'261548'}]);
 await POST(req());
 expect(proximoIndiceR).toHaveBeenCalledWith(2026,['261547','261548']);
});
