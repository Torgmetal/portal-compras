import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({role:vi.fn(),find:vi.fn(),create:vi.fn(),estudo:vi.fn(),vinculo:vi.fn(),audit:vi.fn(),cron:vi.fn()}));
vi.mock('@/lib/session',()=>({requireRole:m.role}));
vi.mock('@/lib/prisma',()=>{const p={oP:{findUnique:m.find,create:m.create},estudoFabricacao:{findUnique:m.estudo},orcamento:{updateMany:m.vinculo},auditLog:{create:m.audit}};return {prisma:{...p,$transaction:fn=>fn(p)}};});
vi.mock('@/lib/cronograma-padrao',()=>({criarCronogramaPadrao:m.cron}));
vi.mock('@/lib/referencias-op',()=>({clientePorNome:vi.fn().mockResolvedValue(null),salvarReferencias:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {POST} from '@/app/api/comercial/op/route';
const corpo={numero:'123',cliente:'Cliente',estoqueMaterial:'',tipoDataBook:'',itens:[{categoria:'MATERIA_PRIMA',tipo:'VERBA',descricao:'Aço',valorVerba:500}],estudoFabricacaoId:'lqc',estudoAtualizadoEm:'2026-09-16T00:00:00.000Z',valorContrato:950};
const req=b=>new Request('http://localhost/api/comercial/op',{method:'POST',body:JSON.stringify(b)});
beforeEach(()=>{vi.clearAllMocks();m.role.mockResolvedValue({id:'u'});m.find.mockResolvedValue(null);m.create.mockResolvedValue({id:'op',numero:'123',cliente:'Cliente'});m.vinculo.mockResolvedValue({count:1});m.estudo.mockResolvedValue({id:'lqc',numero:312,ano:2026,cliente:'Cliente',updatedAt:new Date(corpo.estudoAtualizadoEm),orcamento:{id:'orc',numero:'312-26'},composicao:{resumos:[]}});});
it('gera receita contratada e snapshot do servidor, preservando verba de compra distinta',async()=>{
 const r=await POST(req({...corpo,estudoDados:{falso:true},orcamentoRef:'falso'}));expect(r.status).toBe(200);
 const d=m.create.mock.calls[0][0].data;
 expect(d.receitas.create[0].valor).toBe(950);expect(d.itens.create[0].valorVerba).toBe(500);
 expect(d.estudoDados.estudoFabricacaoId).toBe('lqc');expect(d.estudoDados.falso).toBeUndefined();expect(d.orcamentoRef).toBe('312-26');
 expect(m.vinculo).toHaveBeenCalled();expect(m.audit).toHaveBeenCalledTimes(1);
});
it('exige valor contratado e versão da prévia',async()=>{expect((await POST(req({...corpo,valorContrato:undefined}))).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
it('distingue falta de login e falta de permissão sem criar registros',async()=>{
 m.role.mockRejectedValue(new Error('Forbidden'));expect((await POST(req(corpo))).status).toBe(403);
 m.role.mockRejectedValue(new Error('Unauthorized'));expect((await POST(req(corpo))).status).toBe(401);expect(m.create).not.toHaveBeenCalled();
});
it('não converte novamente orçamento já vinculado',async()=>{m.estudo.mockResolvedValue({id:'lqc',updatedAt:new Date(corpo.estudoAtualizadoEm),orcamento:{opId:'outra'}});expect((await POST(req(corpo))).status).toBe(409);expect(m.create).not.toHaveBeenCalled();});
