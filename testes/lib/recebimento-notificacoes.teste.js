import {it,expect,vi,beforeEach} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/notificacoes',()=>({criarNotificacao:vi.fn().mockResolvedValue({id:'n'})}));
import {criarNotificacao} from '@/lib/notificacoes';
import {notificarMateriaisRecebidos} from '@/lib/recebimento-notificacoes';
beforeEach(()=>{vi.clearAllMocks();mockPrisma.user.findMany.mockResolvedValue([{id:'gabriel'}]);});
it('avisa Gabriel com OP, material e R, com chave estável contra duplicações',async()=>{await notificarMateriaisRecebidos([{importRef:'261234',nome:'CH 12,5',opNumero:'106',numeroCorrida:'C1',nfNumero:'99',quantidade:2,pesoKg:100}],'u');expect(criarNotificacao).toHaveBeenCalledWith(expect.objectContaining({tipo:'MATERIAL_RECEBIDO',destinatarios:['gabriel'],chaveEvento:'CMR_RECEBIDO:261234',link:'/planejamento/recebimento?r=261234',mensagem:expect.stringContaining('C1')}));});
it('não avisa casca vazia e não dispara sem destinatário',async()=>{await notificarMateriaisRecebidos([{importRef:'261234',nome:'(sem descrição)'}]);expect(criarNotificacao).not.toHaveBeenCalled();mockPrisma.user.findMany.mockResolvedValue([]);await notificarMateriaisRecebidos([{importRef:'261234',nome:'CH 12,5'}]);expect(criarNotificacao).not.toHaveBeenCalled();});
