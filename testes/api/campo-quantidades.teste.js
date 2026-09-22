import {it,expect,vi,beforeEach} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'u'})}));
import {GET as buscar} from '@/app/api/campo/pecas/route';
import {PATCH} from '@/app/api/campo/relatorios/[id]/route';
let rel;
beforeEach(()=>{vi.clearAllMocks();rel={id:'r',tipo:'PINTURA',marcas:['P1'],linhas:[],resultados:{prepData:'2026-09-11'},equipamentos:[]};mockPrisma.relatorioInspecao.findUnique.mockImplementation(async()=>rel);mockPrisma.relatorioInspecao.update.mockImplementation(async({data})=>(rel={...rel,...data}));mockPrisma.auditLog.create.mockResolvedValue({});});
it('soma quantidade da mesma marca em frentes diferentes',async()=>{mockPrisma.pecaConjunto.findMany.mockResolvedValue([{marca:'P1',qte:4,perfil:'W200X15'},{marca:'P1',qte:6,perfil:'W200X15'}]);const r=await buscar(new Request('http://localhost?opId=op&todas=1'));expect((await r.json()).pecas[0].quantidade).toBe(10);});
it.each(['PINTURA','VISUAL_SOLDA'])('salva ajuste em %s mantendo condições',async tipo=>{rel.tipo=tipo;const r=await PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({pecasInformadas:[{marca:'P1',quantidade:3}]})}),{params:{id:'r'}});expect(r.status).toBe(200);expect(rel.resultados).toMatchObject({quantidade:'3',qtdPeca:{P1:3},prepData:'2026-09-11'});});
it('não permite alteração de quantidades em dimensional',async()=>{rel.tipo='DIMENSIONAL';const r=await PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({pecasInformadas:[{marca:'P1',quantidade:3}]})}),{params:{id:'r'}});expect(r.status).toBe(400);expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();});
it.each([0,-1,1.5,null])('rejeita quantidade inválida %s sem gravar',async quantidade=>{const r=await PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({pecasInformadas:[{marca:'P1',quantidade}]})}),{params:{id:'r'}});expect(r.status).toBe(400);expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();});
it('impede adicionar peça que não pertence à OP',async()=>{const r=await PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({pecasInformadas:[{marca:'P2',quantidade:3}]})}),{params:{id:'r'}});expect(r.status).toBe(400);});
// ⚠ desde 22/09/2026 o inspetor completa no celular mesmo depois do envio para assinatura
// (Vitor: "não precisa gerar revisão, pode apenas alterar as informações"); a auditoria registra.
it('relatório enviado para assinatura continua editável no celular',async()=>{rel.envioAssinaturaId='a';mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);const r=await PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({pecasInformadas:[{marca:'P1',quantidade:3}]})}),{params:{id:'r'}});expect(r.status).toBe(200);});
it.each(['LP','VISUAL_SOLDA'])('salva em %s os campos do modelo revisado',async tipo=>{rel.tipo=tipo;const campos={desenhoCliente:'SE-024',revisaoCliente:'A',revisaoDesenho:'02',metalAdicao:'E71T-1',processoSolda:'FCAW',eps:'EPS-01',rqs:'RQS-04',tipoJunta:'Filete'};const r=await PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({condicoes:campos})}),{params:{id:'r'}});expect(r.status).toBe(200);expect(rel.resultados).toMatchObject(campos);});

it('salva datas e horários das demãos sem misturar preparo ou apagar lotes', async () => {
  rel.resultados.demaos = { '1': { loteA: 'L001' } };
  const demaos = { '1': {data:'2026-09-20',hIni:'07:15',hFim:'11:45'}, '2': {data:'2026-09-21',hIni:'08:15',hFim:'12:45'}, '3': {data:'2026-09-22',hIni:'09:15',hFim:'13:45'} };
  const r = await PATCH(new Request('http://localhost', {method:'PATCH',body:JSON.stringify({condicoes:{demaos}})}), {params:{id:'r'}});
  expect(r.status).toBe(200);
  expect(rel.resultados.demaos).toMatchObject(demaos);
  expect(rel.resultados.demaos['1'].loteA).toBe('L001');
  expect(rel.resultados.prepData).toBe('2026-09-11');
});

it('inclui e retira marcas da OP mantendo quantidades, condições e auditoria', async () => {
  rel.opId = 'op'; rel.marcas = ['P1','P2'];
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([{marca:'P3'}]);
  const r = await PATCH(new Request('http://localhost', {method:'PATCH',body:JSON.stringify({pecasInformadas:[{marca:'P1',quantidade:2},{marca:'P3',quantidade:4}]})}), {params:{id:'r'}});
  expect(r.status).toBe(200);
  expect(mockPrisma.pecaConjunto.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({opId:'op',marca:{in:['P3']}})}));
  expect(rel.marcas).toEqual(['P1','P3']);
  expect(rel.resultados).toMatchObject({prepData:'2026-09-11',qtdPeca:{P1:2,P3:4},quantidade:'6',pecas:'P1 (2 un.), P3 (4 un.)'});
  expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({diff:expect.objectContaining({antes:expect.objectContaining({marcas:['P1','P2']}),depois:expect.objectContaining({marcas:['P1','P3']})})})}));
});
it('não deixa retirar marca com medição vinculada nem apagar todas as peças', async () => {
  rel.marcas=['P1','P2']; rel.linhas=[{marca:'P2',encontradoMm:25}];
  for (const [pecasInformadas,status] of [[[{marca:'P1',quantidade:1}],409],[[],400]]) {
    const r=await PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({pecasInformadas})}),{params:{id:'r'}});
    expect(r.status).toBe(status);
  }
  expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();
});
