import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'u'})}));
vi.mock('@/lib/relatorio-inspecao',()=>({vincularNoDataBook:vi.fn()}));
vi.mock('@/lib/relatorio-dimensional',()=>({garantirDesenhos:vi.fn()}));
import {PATCH,GET} from '@/app/api/qualidade/inspecoes/[id]/route';
let rel;
beforeEach(()=>{vi.clearAllMocks();rel={id:'r',marcas:['P1'],linhas:[{letra:'A',qtd:99}],resultados:{observacao:'preservar'}};mockPrisma.relatorioInspecao.findUnique.mockImplementation(async()=>rel);mockPrisma.relatorioInspecao.update.mockImplementation(async({data})=>(rel={...rel,...data}));mockPrisma.auditLog.create.mockResolvedValue({});});
const salvar=body=>PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify(body)}),{params:{id:'r'}});
it('salva quantidades por marca e total sem alterar cotas',async()=>{const r=await salvar({pecasInformadas:[{marca:' p1 ',quantidade:5},{marca:'P2',quantidade:3}]});expect(r.status).toBe(200);expect(rel.marcas).toEqual(['P1','P2']);expect(rel.resultados).toMatchObject({quantidade:'8',observacao:'preservar',pecasInformadas:[{marca:'P1',quantidade:5},{marca:'P2',quantidade:3}]});expect(rel.linhas[0].qtd).toBe(99);});
it.each([0,-1,1.5,'',null])('rejeita quantidade inválida %s',async quantidade=>{expect((await salvar({pecasInformadas:[{marca:'P1',quantidade}]})).status).toBe(400);expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();});
it('rejeita marcas duplicadas',async()=>{expect((await salvar({pecasInformadas:[{marca:'p1',quantidade:2},{marca:'P1',quantidade:4}]})).status).toBe(400);});
// ⚠ desde 22/09/2026 relatório assinado continua editável (a auditoria é que marca); ver
// testes/api/inspecao-editar-assinado.
it('relatório assinado continua editável',async()=>{rel.envioAssinaturaId='assinado';mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);expect((await salvar({pecasInformadas:[{marca:'P1',quantidade:2}]})).status).toBe(200);});
it('preserva quantidades salvas ao editar outro campo e recalcula o total',async()=>{
 rel.resultados.pecasInformadas=[{marca:'P1',quantidade:5}];
 const r=await salvar({resultados:{quantidade:'999'},observacoes:'Conferido'});
 expect(r.status).toBe(200);expect(rel.resultados.quantidade).toBe('5');expect(rel.resultados.pecasInformadas).toEqual([{marca:'P1',quantidade:5}]);
});
it('impede cliente antigo de deixar marcas e quantidades inconsistentes',async()=>{
 rel.resultados.pecasInformadas=[{marca:'P1',quantidade:5}];
 expect((await salvar({marcas:['P2']})).status).toBe(409);expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();
});

it('consulta a lista pelo vínculo da OP sem gravar sugestões no relatório',async()=>{
 rel.opId='obra-106';rel.opNumero='106';
 mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([{marca:'P1',qte:6},{marca:'P1',qte:4}]);
 const r=await GET(null,{params:{id:'r'}});const j=await r.json();
 expect(j.quantidadesLista).toEqual({P1:10});
 // ⚠ croqui fora: é componente do conjunto, não peça de inspeção (mesma regra do portal de campo)
 expect(mockPrisma.pecaConjunto.findMany).toHaveBeenCalledWith({where:{opId:'obra-106',OR:[{tipoPeca:'CONJUNTO'},{tipoPeca:null}]},select:{marca:true,qte:true}});
 expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();
});
// ⚠⚠ ERA O CONTRÁRIO ATÉ 22/09/2026: relatório enviado para assinatura não buscava a lista, porque
// era somente leitura. Agora ele é editável, e sem as sugestões o editor de peças abre com a lista
// de marcas vazia — a Lais não conseguia "puxar as peças informadas" justamente nos relatórios já
// enviados (os EVS/LP da OP-102).
it('relatório enviado para assinatura também recebe a lista da OP — ele é editável',async()=>{
 rel.envioAssinaturaId='assinado';rel.opId='obra-106';
 mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([{marca:'P1',qte:6}]);
 const j=await (await GET(null,{params:{id:'r'}})).json();
 expect(j.quantidadesLista).toEqual({P1:6});
 expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();
});
