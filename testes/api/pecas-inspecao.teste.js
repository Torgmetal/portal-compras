import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('@/lib/session',()=>({requireRole:vi.fn().mockResolvedValue({id:'u'})}));
vi.mock('@/lib/relatorio-inspecao',()=>({vincularNoDataBook:vi.fn()}));
vi.mock('@/lib/relatorio-dimensional',()=>({garantirDesenhos:vi.fn()}));
import {PATCH} from '@/app/api/qualidade/inspecoes/[id]/route';
let rel;
beforeEach(()=>{vi.clearAllMocks();rel={id:'r',marcas:['P1'],linhas:[{letra:'A',qtd:99}],resultados:{observacao:'preservar'}};mockPrisma.relatorioInspecao.findUnique.mockImplementation(async()=>rel);mockPrisma.relatorioInspecao.update.mockImplementation(async({data})=>(rel={...rel,...data}));mockPrisma.auditLog.create.mockResolvedValue({});});
const salvar=body=>PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify(body)}),{params:{id:'r'}});
it('salva quantidades por marca e total sem alterar cotas',async()=>{const r=await salvar({pecasInformadas:[{marca:' p1 ',quantidade:5},{marca:'P2',quantidade:3}]});expect(r.status).toBe(200);expect(rel.marcas).toEqual(['P1','P2']);expect(rel.resultados).toMatchObject({quantidade:'8',observacao:'preservar',pecasInformadas:[{marca:'P1',quantidade:5},{marca:'P2',quantidade:3}]});expect(rel.linhas[0].qtd).toBe(99);});
it.each([0,-1,1.5,'',null])('rejeita quantidade inválida %s',async quantidade=>{expect((await salvar({pecasInformadas:[{marca:'P1',quantidade}]})).status).toBe(400);expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();});
it('rejeita marcas duplicadas',async()=>{expect((await salvar({pecasInformadas:[{marca:'p1',quantidade:2},{marca:'P1',quantidade:4}]})).status).toBe(400);});
it('preserva bloqueio de assinatura',async()=>{rel.envioAssinaturaId='assinado';expect((await salvar({pecasInformadas:[{marca:'P1',quantidade:2}]})).status).toBe(409);});
it('preserva quantidades salvas ao editar outro campo e recalcula o total',async()=>{
 rel.resultados.pecasInformadas=[{marca:'P1',quantidade:5}];
 const r=await salvar({resultados:{quantidade:'999'},observacoes:'Conferido'});
 expect(r.status).toBe(200);expect(rel.resultados.quantidade).toBe('5');expect(rel.resultados.pecasInformadas).toEqual([{marca:'P1',quantidade:5}]);
});
it('impede cliente antigo de deixar marcas e quantidades inconsistentes',async()=>{
 rel.resultados.pecasInformadas=[{marca:'P1',quantidade:5}];
 expect((await salvar({marcas:['P2']})).status).toBe(409);expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();
});
