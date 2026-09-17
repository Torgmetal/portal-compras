import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({role:vi.fn(),find:vi.fn(),create:vi.fn(),estudo:vi.fn(),vinculo:vi.fn(),audit:vi.fn(),cron:vi.fn()}));
vi.mock('@/lib/session',()=>({requireRole:m.role}));
vi.mock('@/lib/prisma',()=>{const p={oP:{findUnique:m.find,create:m.create},estudoFabricacao:{findUnique:m.estudo},orcamento:{updateMany:m.vinculo},auditLog:{create:m.audit}};return {prisma:{...p,$transaction:fn=>fn(p)}};});
vi.mock('@/lib/cronograma-padrao',()=>({criarCronogramaPadrao:m.cron}));
vi.mock('@/lib/referencias-op',()=>({clientePorNome:vi.fn().mockResolvedValue(null),salvarReferencias:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {POST} from '@/app/api/comercial/op/route';
import {prepararOpConferida} from '@/lib/lqc-op-servidor';
// ⚠ A composição precisa ser REAL o bastante para gerar itens: desde a conferência de custos da
// LQC (b4c2bb5421, 16/09/2026) o POST recusa itens que não saiam da prévia. Com `resumos:[]` a
// prévia vem sem item nenhum e nada do que este teste afirma pode ser exercitado. É a mesma
// fixture de `testes/lib/lqc-calcular.teste.js`, reduzida ao que forma custo de matéria-prima.
const COMPOSICAO={
 resumos:[{ativo:true,descricao:'Cobertura',estrutura:'COBERTURA',classificacao:'MEDIO',perfil:'W',quantidade:10,unidades:1,pesoUnit:500,areaM2:160}],
 tintas:[{camada:'PRIMER',perda:45,solidos:60,peliculaSeca:100,precoLitro:42,precoDiluente:12}],
 faturamento:{materiaPrima:'TORG',fixadores:'TORG',tintas:'TORG',itensComerciais:'TORG'},
 alavancas:{lucro:12,despesasFixas:8,comissao:3,factoring:2},
};
const corpo={numero:'123',cliente:'Cliente',estoqueMaterial:'',tipoDataBook:'',itens:[{categoria:'MATERIA_PRIMA',tipo:'VERBA',descricao:'Aço',valorVerba:500}],estudoFabricacaoId:'lqc',estudoAtualizadoEm:'2026-09-16T00:00:00.000Z',valorContrato:950};
const req=b=>new Request('http://localhost/api/comercial/op',{method:'POST',body:JSON.stringify(b)});
beforeEach(()=>{vi.clearAllMocks();m.role.mockResolvedValue({id:'u'});m.find.mockResolvedValue(null);m.create.mockResolvedValue({id:'op',numero:'123',cliente:'Cliente'});m.vinculo.mockResolvedValue({count:1});m.estudo.mockResolvedValue({id:'lqc',numero:312,ano:2026,cliente:'Cliente',updatedAt:new Date(corpo.estudoAtualizadoEm),orcamento:{id:'orc',numero:'312-26'},composicao:COMPOSICAO});});
// ⚠⚠ A PRÉVIA PASSOU A CARIMBAR UM CÓDIGO, E O POST EXIGE ELE DE VOLTA. Desde a conferência de
// custos da LQC (b4c2bb5421, 16/09/2026), `validarPreenchimentoLqc` recusa a criação sem
// `conferenciaCodigo` igual ao da prévia — é o que impede criar OP a partir de uma prévia velha,
// aberta antes de alguém mexer na planilha. O teste passa a fazer o que a tela faz: pede a prévia,
// pega o código e devolve. Calcular o hash aqui à mão só provaria que sei repetir a fórmula.
const comPrevia=async extra=>{
 const previa=await prepararOpConferida(await m.estudo());
 return {previa,pedido:req({...corpo,itens:previa.itens,conferenciaCodigo:previa.conferencia.codigo,...extra})};
};
it('gera receita contratada e snapshot do servidor, preservando verba de compra distinta',async()=>{
 const {previa,pedido}=await comPrevia({estudoDados:{falso:true},orcamentoRef:'falso'});
 const r=await POST(pedido);expect(r.status).toBe(200);
 const d=m.create.mock.calls[0][0].data;
 // ⚠ O PONTO DO TESTE: a receita é a VENDA contratada (950) e a verba é o CUSTO de compra vindo da
 // LQC. São grandezas independentes — se um dia a criação passar a derivar uma da outra, aqui quebra.
 expect(d.receitas.create[0].valor).toBe(950);
 expect(previa.itens.length).toBeGreaterThan(0);
 expect(d.itens.create[0].valorVerba).toBe(previa.itens[0].valorVerba);
 expect(d.itens.create[0].valorVerba).not.toBe(950);
 expect(d.estudoDados.estudoFabricacaoId).toBe('lqc');expect(d.estudoDados.falso).toBeUndefined();expect(d.orcamentoRef).toBe('312-26');
 expect(m.vinculo).toHaveBeenCalled();expect(m.audit).toHaveBeenCalledTimes(1);
});
it('exige valor contratado e versão da prévia',async()=>{expect((await POST(req({...corpo,valorContrato:undefined}))).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
it('distingue falta de login e falta de permissão sem criar registros',async()=>{
 m.role.mockRejectedValue(new Error('Forbidden'));expect((await POST(req(corpo))).status).toBe(403);
 m.role.mockRejectedValue(new Error('Unauthorized'));expect((await POST(req(corpo))).status).toBe(401);expect(m.create).not.toHaveBeenCalled();
});
it('não converte novamente orçamento já vinculado',async()=>{m.estudo.mockResolvedValue({id:'lqc',updatedAt:new Date(corpo.estudoAtualizadoEm),orcamento:{opId:'outra'}});expect((await POST(req(corpo))).status).toBe(409);expect(m.create).not.toHaveBeenCalled();});
