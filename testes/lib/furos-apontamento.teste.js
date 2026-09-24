import {beforeEach, expect, it, vi} from 'vitest';
import {mockPrisma} from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma}));
import {listarFurosApontamento} from '@/lib/conjuntos-setor';
const peca=(extra={})=>({id:'p85',opId:'op85',opNumero:'T85A',marca:'IPPE1',naLPC:true,tipoPeca:'CONJUNTO',qte:2,op:{numero:'085',status:'ABERTA'},...extra});
const ordem=(setor,produzidoUn,extra={})=>({opId:'op85',obra:'T85',op:'ordem1',operacao:setor,item:'IPPE1',setor,produzidoUn,planejadoUn:2,...extra});
beforeEach(()=>{
 vi.clearAllMocks();
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca()]);
 mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem('Montagem',0),ordem('Solda',2)]);
 mockPrisma.mesInativo.findMany.mockResolvedValue([]);
});
it('identifica a OP, a fase da LPC e a obra real do Syneco separadamente',async()=>{
 const [f]=await listarFurosApontamento();
 expect(f).toMatchObject({op:'085',opNumero:'T85A',obraSyneco:'T85',marca:'IPPE1',qte:2,setorUp:'Montagem',valorUp:0,setor:'Solda',valor:2,diff:2});
});
it('não mistura marca igual em outra OP nem em outra obra do Syneco',async()=>{
 mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem('Montagem',0),ordem('Solda',2,{opId:'op67',obra:'T67'}),ordem('Pintura',2,{obra:'T85B'})]);
 expect(await listarFurosApontamento()).toEqual([]);
});
it('retorno do terceiro para Jato não exige apontar Montagem e Solda',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca({terceirizado:true,destinoTerceirizado:'JATO'})]);
 mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem('Montagem',0),ordem('Solda',0),ordem('Jato',2)]);
 expect(await listarFurosApontamento()).toEqual([]);
});
it('mantém a diferença após o retorno do terceiro',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca({terceirizado:true,destinoTerceirizado:'JATO'})]);
 mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem('Montagem',0),ordem('Jato',1),ordem('Pintura',2)]);
 expect(await listarFurosApontamento()).toEqual([expect.objectContaining({setorUp:'Jato',valorUp:1,setor:'Pintura',diff:1})]);
});
it('respeita encaminhamento direto e mantém Acabamento opcional',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca({encaminhadoSetor:'JATO'})]);
 mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem('Montagem',0),ordem('Acabamento',0),ordem('Jato',2),ordem('Pintura',2)]);
 expect(await listarFurosApontamento()).toEqual([]);
});
it('não transforma rota indefinida de terceiro em quantidade pronta para baixar',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca({terceirizado:true})]);
 expect((await listarFurosApontamento())[0]).toMatchObject({situacao:'CONFERIR_ROTA'});
});
it('somente busca conjuntos da LPC atual, vinculados a OP não encerrada',async()=>{
 await listarFurosApontamento();
 const where=mockPrisma.pecaConjunto.findMany.mock.calls[0][0].where;
 expect(where).toMatchObject({naLPC:true,opId:{not:null},op:{status:{notIn:['ENCERRADA','CANCELADA']}}});
 expect(where.fonte).toBeUndefined();
});
it('preserva exclusão de etapa inativa sem produção',async()=>{
 mockPrisma.mesInativo.findMany.mockResolvedValue([{op:'ordem1',item:'IPPE1',operacao:'Montagem'}]);
 expect(await listarFurosApontamento()).toEqual([]);
});
it('não presume a fase quando a mesma marca tem duas linhas na LPC',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca(),peca({id:'p85b',opNumero:'T85B'})]);
 expect((await listarFurosApontamento())[0]).toMatchObject({situacao:'CONFERIR_VINCULO',qte:null});
});
