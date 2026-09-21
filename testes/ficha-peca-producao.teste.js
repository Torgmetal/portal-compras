import {it,expect,vi} from 'vitest';
vi.mock('@/lib/prisma',()=>({prisma:{mesOrdem:{findMany:vi.fn()}}}));
import {prisma} from '@/lib/prisma';
import {producaoDaMarca} from '@/lib/ficha-peca-producao';
it('consulta a marca exata na OP e usa a sequência produtiva, sem promover etapas sem produção',async()=>{
 prisma.mesOrdem.findMany.mockResolvedValue([
 {setor:'Solda',produzidoUn:2,pesoProduzido:20,dataInicio:new Date('2026-09-10'),updatedAt:new Date('2026-09-11')},
 {setor:'Corte',produzidoUn:2,pesoProduzido:20,dataInicio:new Date('2026-09-12'),updatedAt:new Date('2026-09-12')},
 {setor:'Pintura',produzidoUn:0,pesoProduzido:0},
 ]);
 const r=await producaoDaMarca('op112','T112A1');
 expect(prisma.mesOrdem.findMany.mock.calls[0][0].where).toEqual({opId:'op112',item:'T112A1'});
 expect(r.setorAtual).toBe('Solda');expect(r.trilha.map(x=>x.setor)).toEqual(['Corte','Solda']);
 expect(r.atualizadoEm).toBe('2026-09-12T00:00:00.000Z');
});
