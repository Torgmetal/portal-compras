import { beforeEach, expect, it, vi } from 'vitest';
import { mockPrisma } from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma', () => ({prisma: mockPrisma}));
vi.mock('@/lib/produzido-setor', () => ({lerProduzidoPorSetor: vi.fn()}));
vi.mock('@/lib/cmr-obra-divergente', () => ({obrasDivergentesDoPedido: async () => []}));
import { lerProduzidoPorSetor } from '@/lib/produzido-setor';
import { listaBaixaSyneco } from '@/lib/baixa-syneco';
import { cadernoDePintura } from '@/lib/pintura-lote';
const p = {id:'a', opId:'op', opNumero:'T115', marca:'A1', descricao:'VIGA', qte:10, pesoUnitKg:20, pesoTotalKg:200, areaPinturaM2:40, montagemDiaProgramado:'2026-09-10', montagemBancada:'B1'};
beforeEach(() => {
 vi.clearAllMocks();
 mockPrisma.oP.findFirst.mockResolvedValue({id:'op',numero:'115'});
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([p]);
 mockPrisma.ganttDistribuicao.findMany.mockResolvedValue([{pecaId:'a', setor:'MONTAGEM',quantidade:10,ancoraDia:'2026-09-10',ancoraRecurso:'B1',partes:[{inicio:0,quantidade:5,dia:'2026-09-12',recurso:'B1'},{inicio:5,quantidade:5,dia:'2026-09-10',recurso:'B1'}]}]);
 lerProduzidoPorSetor.mockResolvedValue(() => 3);
 mockPrisma.planoPintura.findFirst.mockResolvedValue(null);
 mockPrisma.produtoTinta.findMany.mockResolvedValue([]);
 mockPrisma.tintaProduto.findMany.mockResolvedValue([]);
 mockPrisma.documentoQualidade.findMany.mockResolvedValue([]);
});
it('Baixa limita ao saldo da faixa selecionada pela ordem cronológica', async () => {
 const r=await listaBaixaSyneco('115','MONTAGEM',['a'],[{id:'a',inicio:5,quantidade:5}]);
 expect(r.linhas[0]).toMatchObject({qte:5,jaApontado:3,aBaixar:2,pesoABaixarKg:40});
 const depois=await listaBaixaSyneco('115','MONTAGEM',['a'],[{id:'a',inicio:0,quantidade:2}]);
 expect(depois.linhas[0]).toMatchObject({qte:2,jaApontado:0,aBaixar:2});
});
it('Baixa recorta dentro de uma parte sem descontar a produção novamente',async()=>{
 const r=await listaBaixaSyneco('115','MONTAGEM',['a'],[{id:'a',inicio:7,quantidade:3}]);
 expect(r.linhas[0]).toMatchObject({qte:3,jaApontado:1,aBaixar:2});
});
it('Pintura conserva proporção de quantidade, peso e área',async()=>{
 const r=await cadernoDePintura('115',['a'],[{id:'a',inicio:5,quantidade:2}]);
 expect(r.pecas[0]).toMatchObject({qte:2,kg:40,m2:8});
 expect(r.quantidade).toMatchObject({pecas:2,kg:40,m2:8});
 expect(r.porCor[0]).toMatchObject({pecas:2,kg:40,m2:8});
});
it.each([
 [{id:'a',inicio:9,quantidade:2}],
 [{id:'a',inicio:0,quantidade:3},{id:'a',inicio:2,quantidade:1}],
 [{id:'desconhecido',inicio:0,quantidade:1}],
 [{id:'a',inicio:-1,quantidade:1}],
 [],
].map(fracoes => [fracoes]))('rejeita seleção inválida %j',async(fracoes)=>{
 await expect(listaBaixaSyneco('115','MONTAGEM',['a'],fracoes)).rejects.toThrow();
 await expect(cadernoDePintura('115',['a'],fracoes)).rejects.toThrow();
});
it('sem frações conserva baixa integral',async()=>{
 const r=await listaBaixaSyneco('115','MONTAGEM',['a']);
 expect(r.linhas[0]).toMatchObject({qte:10,jaApontado:3,aBaixar:7});
});

it('une faixas separadas da mesma marca sem trazer as unidades entre elas',async()=>{
 const fracoes=[{id:'a',inicio:0,quantidade:2},{id:'a',inicio:8,quantidade:2}];
 const baixa=await listaBaixaSyneco('115','MONTAGEM',['a'],fracoes);
 expect(baixa.linhas).toHaveLength(1);
 expect(baixa.linhas[0]).toMatchObject({qte:4,jaApontado:0,aBaixar:4});
 const pintura=await cadernoDePintura('115',['a'],fracoes);
 expect(pintura.quantidade).toMatchObject({pecas:4,kg:80,m2:16});
});
it('dimensiona tinta pela área selecionada e preserva área desconhecida',async()=>{
 mockPrisma.planoPintura.findFirst.mockResolvedValue({demaos:[{ordem:1,produto:'Primer',espessuraMax:100,solidosVol:80,diluicaoPct:10}],itens:[]});
 const r=await cadernoDePintura('115',['a'],[{id:'a',inicio:0,quantidade:2}]);
 expect(r.quantidade.litros).toBeCloseTo(1.18,2);
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([{...p,areaPinturaM2:null}]);
 const semArea=await cadernoDePintura('115',['a'],[{id:'a',inicio:0,quantidade:2}]);
 expect(semArea.pecas[0].m2).toBeNull();
});
it('descarta distribuição cuja âncora foi alterada por outra tela',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([{...p,montagemDiaProgramado:'2026-09-14'}]);
 const r=await listaBaixaSyneco('115','MONTAGEM',['a'],[{id:'a',inicio:0,quantidade:2}]);
 expect(r.linhas[0]).toMatchObject({qte:2,jaApontado:2,aBaixar:0});
});
