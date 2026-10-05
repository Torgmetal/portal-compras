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
import {lerLinhasCmr} from '@/lib/cmr-sharepoint';
import {hashDoLote} from '@/lib/cmr-lote';
import {POST} from '@/app/api/compras/cmr/route';
const LOTE='3f1c2a9e-1111-4222-8333-444455556666';
const LANC=[{descricao:'CH 12,5'},{descricao:'W150'}];
const req=(corpo={})=>new Request('http://localhost/api/compras/cmr',{method:'POST',body:JSON.stringify({ano:2026,espelhar:false,loteId:LOTE,lancamentos:LANC,...corpo})});
beforeEach(()=>{
 vi.clearAllMocks();
 mockPrisma.cmrLote.findUnique.mockResolvedValue(null);
 mockPrisma.$queryRaw.mockResolvedValue([]);
 mockPrisma.documentoQualidade.createManyAndReturn.mockImplementation(async({data})=>data.map((d)=>({id:`id${d.importRef}`,...d})));
 mockPrisma.cmrLote.create.mockResolvedValue({});
 mockPrisma.auditLog.create.mockResolvedValue({});
});
it('só avisa depois de salvar os recebimentos',async()=>{
 expect((await POST(req())).status).toBe(200);
 expect(notificarMateriaisRecebidos).toHaveBeenCalledWith([{id:'id261234',nome:'CH 12,5',importRef:'261234'},{id:'id261235',nome:'W150',importRef:'261235'}],'almox');
 expect(mockPrisma.auditLog.create.mock.invocationCallOrder[0]).toBeLessThan(notificarMateriaisRecebidos.mock.invocationCallOrder[0]);
});
// ⚠ Antes, uma falha no meio deixava parte do lote gravada. Agora é tudo ou nada: nada gravado,
// nada avisado — e a mensagem diz isso, para ninguém sair conferindo R que não existem.
it('falha na gravação: nada é gravado nem avisado',async()=>{
 mockPrisma.documentoQualidade.createManyAndReturn.mockRejectedValueOnce(new Error('Falha'));
 const res=await POST(req());
 expect(res.status).toBe(500);
 expect((await res.json()).error).toMatch(/nada foi gravado/);
 expect(notificarMateriaisRecebidos).not.toHaveBeenCalled();
});

// ⚠⚠ A RECUSA É DELIBERADA. Sem conseguir ler a planilha o portal NÃO emite R: o lançamento fica
// para daqui a pouco, enquanto um número duplicado contamina o certificado que vai ao cliente e só
// aparece semanas depois.
it('sem a planilha, não emite R — recusa com 503',async()=>{
 lerLinhasCmr.mockRejectedValueOnce(new Error('SharePoint fora do ar'));
 const res=await POST(req());
 expect(res.status).toBe(503);
 expect((await res.json()).error).toMatch(/planilha/i);
 expect(mockPrisma.documentoQualidade.createManyAndReturn).not.toHaveBeenCalled();
});

// ⚠ E o R emitido pula o que a planilha já usa — é o que impede dois materiais no mesmo índice.
it('o R emitido considera o que a planilha já ocupa',async()=>{
 const {proximoIndiceR}=await import('@/lib/cmr');
 lerLinhasCmr.mockResolvedValueOnce([{indiceR:'261547'},{indiceR:'261548'}]);
 await POST(req());
 expect(proximoIndiceR).toHaveBeenCalledWith(2026,['261547','261548'],mockPrisma);
});

// ⚠⚠ Pedido 2054 (05/10/2026): a resposta se perdeu e a tela ficou com "Gravar 43" de pé.
it('reenvio do mesmo lote devolve os R já gravados, sem ir à planilha nem criar nada',async()=>{
 mockPrisma.cmrLote.findUnique.mockResolvedValue({id:LOTE,userId:'almox',hash:hashDoLote(LANC),indices:['261832','261833'],docIds:['a','b']});
 mockPrisma.documentoQualidade.findMany.mockResolvedValue([{id:'b',importRef:'261833'},{id:'a',importRef:'261832'}]);
 const res=await POST(req());
 const j=await res.json();
 expect(res.status).toBe(200);
 expect(j).toMatchObject({replay:true,indices:['261832','261833'],criados:2});
 expect(lerLinhasCmr).not.toHaveBeenCalled();
 expect(mockPrisma.documentoQualidade.createManyAndReturn).not.toHaveBeenCalled();
 // os avisos são completados no reenvio — a tentativa interrompida pode ter parado no meio deles
 expect(notificarMateriaisRecebidos).toHaveBeenCalledWith([{id:'a',importRef:'261832'},{id:'b',importRef:'261833'}],'almox');
});
it('mesma chave com outro conteúdo: 409, nada criado',async()=>{
 mockPrisma.cmrLote.findUnique.mockResolvedValue({id:LOTE,userId:'almox',hash:'outro',indices:[],docIds:[]});
 const res=await POST(req());
 expect(res.status).toBe(409);
 expect(mockPrisma.documentoQualidade.createManyAndReturn).not.toHaveBeenCalled();
});
it('sem a chave do lote: 400',async()=>{
 const res=await POST(req({loteId:undefined}));
 expect(res.status).toBe(400);
});
