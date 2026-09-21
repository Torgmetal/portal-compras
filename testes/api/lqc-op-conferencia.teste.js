import {expect,it,vi,beforeEach} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'u'})}));
vi.mock('@/lib/lqc-op-servidor',()=>({prepararOpConferida:vi.fn()}));
vi.mock('@/lib/referencias-op',()=>({clientePorNome:vi.fn(),salvarReferencias:vi.fn()}));
vi.mock('@/lib/cronograma-padrao',()=>({criarCronogramaPadrao:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {POST} from '@/app/api/comercial/op/route';
import {prepararOpConferida} from '@/lib/lqc-op-servidor';
import {requireRole} from '@/lib/session';
const e={id:'e',updatedAt:new Date('2026-09-16'),orcamento:{id:'o',valor:950}};
const p={estudoId:'e',atualizadoEm:e.updatedAt.toISOString(),orcamentoId:'o',orcamentoRef:'123-26',codigo:'LQC-123-26',valorContrato:950,conferencia:{ok:true,codigo:'hash'},form:{obra:'OS1'},estudoArquivo:{id:'arquivo'},estudoDados:{origem:'LQC_PORTAL'},itens:[{categoria:'MATERIA_PRIMA',tipo:'ESTRUTURA',descricao:'Aço A',valorVerba:500,unidade:'KG',qtdContratada:100,cmcMedio:5,faturamentoDireto:false}]};
const body=()=>({numero:'123',cliente:'Cliente',estudoFabricacaoId:'e',estudoAtualizadoEm:p.atualizadoEm,conferenciaCodigo:'hash',valorContrato:950,itens:p.itens});
const req=b=>new Request('http://localhost/api/comercial/op',{method:'POST',body:JSON.stringify(b),headers:{'content-type':'application/json'}});
beforeEach(()=>{vi.clearAllMocks();requireRole.mockResolvedValue({id:'u'});mockPrisma.oP.findUnique.mockResolvedValue(null);mockPrisma.estudoFabricacao.findUnique.mockResolvedValue(e);mockPrisma.orcamento.updateMany.mockResolvedValue({count:1});mockPrisma.oP.create.mockResolvedValue({id:'op',numero:'123'});prepararOpConferida.mockResolvedValue(p)});
it('grava a mesma quantidade, custo, receita e arquivo conferidos',async()=>{
 const r=await POST(req(body()));expect(r.status).toBe(200);
 expect(mockPrisma.oP.create).toHaveBeenCalledWith({data:expect.objectContaining({estudoArquivo:p.estudoArquivo,estudoDados:p.estudoDados,itens:{create:[expect.objectContaining({qtdContratada:100,cmcMedio:5,valorVerba:500})]},receitas:{create:[expect.objectContaining({valor:950})]}})});
 expect(mockPrisma.auditLog.create).toHaveBeenCalled();
});
it.each(['custo','quantidade','fonte','contrato'])('não grava quando %s difere do que foi conferido',async(tipo)=>{
 const b=structuredClone(body());if(tipo==='custo')b.itens[0].valorVerba=550;if(tipo==='quantidade')b.itens[0].qtdContratada=110;if(tipo==='fonte')b.conferenciaCodigo='velho';if(tipo==='contrato')b.valorContrato=1000;
 const r=await POST(req(b));expect(r.status).toBe(409);expect(mockPrisma.oP.create).not.toHaveBeenCalled();
});
it('não grava quando SharePoint falha',async()=>{
 prepararOpConferida.mockRejectedValue(new Error('SharePoint indisponível'));const r=await POST(req(body()));expect(r.status).toBe(409);expect(mockPrisma.oP.create).not.toHaveBeenCalled();
});
it('não grava uma prévia desatualizada da LQC',async()=>{
 mockPrisma.estudoFabricacao.findUnique.mockResolvedValue({...e,updatedAt:new Date('2026-09-17')});
 const r=await POST(req(body()));expect(r.status).toBe(409);expect(mockPrisma.oP.create).not.toHaveBeenCalled();
});
it('mantém autenticação antes de qualquer leitura de custos',async()=>{
 requireRole.mockRejectedValue(new Error('Unauthorized'));expect((await POST(req(body()))).status).toBe(401);expect(prepararOpConferida).not.toHaveBeenCalled();
});
