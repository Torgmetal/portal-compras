import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('@/lib/session',()=>({requireRole:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{oP:{findUnique:vi.fn()},relatorioInspecao:{findMany:vi.fn(),count:vi.fn()}}}));
import {requireRole} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import {GET} from '@/app/api/producao/qualidade/route';
beforeEach(()=>vi.resetAllMocks());
it('rejeita acesso sem sessão',async()=>{requireRole.mockRejectedValue(new Error('Unauthorized'));expect((await GET(new Request('http://localhost/api/producao/qualidade?opId=op112'))).status).toBe(401);expect(prisma.oP.findUnique).not.toHaveBeenCalled();});
it('restringe os relatórios à OP e não seleciona tokens de assinatura',async()=>{
 requireRole.mockResolvedValue({tipo:'USUARIO',modulos:['PRODUCAO']});prisma.oP.findUnique.mockResolvedValue({id:'op112',numero:'112'});prisma.relatorioInspecao.findMany.mockResolvedValue([]);prisma.relatorioInspecao.count.mockResolvedValue(0);
 const res=await GET(new Request('http://localhost/api/producao/qualidade?opId=op112&resultado=REPROVADO'));
 expect(res.status).toBe(200);const args=prisma.relatorioInspecao.findMany.mock.calls[0][0];
 expect(args.where).toEqual({OR:[{opId:'op112'},{opId:null,opNumero:'112'}],resultadoInspecao:'REPROVADO'});
 expect(args.select.envioAssinaturaId).toBeUndefined();expect(args.select.arquivoUrl).toBeUndefined();
});
