import {it,expect,vi,beforeEach} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'almox'})}));
vi.mock('@/lib/cmr',()=>({CMR_CAT:'MATERIAL',prefixoAno:()=> '26',proximoIndiceR:vi.fn().mockResolvedValue('261234'),mapearLancamento:(l,r)=>({nome:l.descricao,importRef:r}),aprenderReferencias:vi.fn().mockResolvedValue()}));
vi.mock('@/lib/cmr-sharepoint',()=>({appendLinhasCmr:vi.fn().mockResolvedValue({})}));
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
