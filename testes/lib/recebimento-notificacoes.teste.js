import {it,expect,vi,beforeEach} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
import {notificarMateriaisRecebidos} from '@/lib/recebimento-notificacoes';
beforeEach(()=>{
 vi.clearAllMocks();
 mockPrisma.user.findMany.mockResolvedValue([{id:'gabriel'}]);
 mockPrisma.notificacao.findMany.mockImplementation(async({where})=>where.chaveEvento.in.map((c)=>({id:`n-${c}`})));
});
it('avisa Gabriel com OP, material e R, com chave estável contra duplicações',async()=>{
 await notificarMateriaisRecebidos([{importRef:'261234',nome:'CH 12,5',opNumero:'106',numeroCorrida:'C1',nfNumero:'99',quantidade:2,pesoKg:100}],'u');
 expect(mockPrisma.notificacao.createMany).toHaveBeenCalledWith({skipDuplicates:true,data:[expect.objectContaining({tipo:'MATERIAL_RECEBIDO',chaveEvento:'CMR_RECEBIDO:261234',link:'/planejamento/recebimento?r=261234',mensagem:expect.stringContaining('C1'),origemUserId:'u'})]});
 expect(mockPrisma.notificacaoDestinatario.createMany).toHaveBeenCalledWith({skipDuplicates:true,data:[{notificacaoId:'n-CMR_RECEBIDO:261234',userId:'gabriel'}]});
});
it('não avisa casca vazia e não dispara sem destinatário',async()=>{
 await notificarMateriaisRecebidos([{importRef:'261234',nome:'(sem descrição)'}]);
 expect(mockPrisma.notificacao.createMany).not.toHaveBeenCalled();
 mockPrisma.user.findMany.mockResolvedValue([]);
 await notificarMateriaisRecebidos([{importRef:'261234',nome:'CH 12,5'}]);
 expect(mockPrisma.notificacao.createMany).not.toHaveBeenCalled();
});
// ⚠⚠ Pedido 2054 (05/10/2026): um aviso por R, ~1 s cada, segurou a resposta até a Vercel derrubar a
// função nos 60 s. 43 R agora custam três consultas, não 86.
it('lote de 43 R: três consultas, não uma por R',async()=>{
 const lote=Array.from({length:43},(_,i)=>({importRef:String(261832+i),nome:`ITEM ${i}`}));
 await notificarMateriaisRecebidos(lote,'u');
 expect(mockPrisma.notificacao.createMany).toHaveBeenCalledTimes(1);
 expect(mockPrisma.notificacao.createMany.mock.calls[0][0].data).toHaveLength(43);
 expect(mockPrisma.notificacao.findMany).toHaveBeenCalledTimes(1);
 expect(mockPrisma.notificacaoDestinatario.createMany).toHaveBeenCalledTimes(1);
 expect(mockPrisma.notificacaoDestinatario.createMany.mock.calls[0][0].data).toHaveLength(43);
});
// ⚠ Reenvio recupera aviso que nasceu sem destinatário: o aviso já existe (skipDuplicates), mas a
// busca pelos chaveEvento o encontra e o destinatário entra agora.
it('aviso já existente ainda ganha o destinatário que faltou',async()=>{
 await notificarMateriaisRecebidos([{importRef:'261832',nome:'ARRUELA'}],'u');
 expect(mockPrisma.notificacaoDestinatario.createMany).toHaveBeenCalledWith(expect.objectContaining({data:[{notificacaoId:'n-CMR_RECEBIDO:261832',userId:'gabriel'}]}));
});
