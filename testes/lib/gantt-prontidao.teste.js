import { beforeEach, expect, it, vi } from 'vitest';
import { mockPrisma } from '@/testes/apoio/prisma';
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma,prismaDirect:mockPrisma}));
import { aplicarRemanejo } from '@/lib/gantt-pcp';
import { prontidaoDoGantt, itemAptoMontagem } from '@/lib/gantt-prontidao';

const usuario={id:'u1',name:'Gabriel'};
const bloco=(ids,recurso=null)=>({setor:'MONTAGEM',ids,recurso,dia:'2026-09-15'});
const conjunto=(id,cortado)=>({id,marca:id,fonte:'LPC_IMPORT',tipoPeca:'CONJUNTO',status:'CORTE',montagemDiaProgramado:null,montagemDiaOriginal:null,conjuntoCroquis:[{croqui:{marca:'CR-'+id,qte:2,qteProduzida:cortado?2:0}}]});
beforeEach(()=>{
 vi.clearAllMocks();
 mockPrisma.pecaConjunto.findMany.mockImplementation(async ({where})=>[conjunto('C01',true),conjunto('C02',false)].filter(c=>where.id.in.includes(c.id)));
 mockPrisma.pecaConjunto.updateMany.mockResolvedValue({count:1});
});
it('permite programar corte pendente na fila sem bancada sem liberar montagem',async()=>{
 await aplicarRemanejo([bloco(['C02'])],usuario);
 const escritas=mockPrisma.pecaConjunto.updateMany.mock.calls.map(([x])=>x.data);
 expect(escritas).toContainEqual(expect.objectContaining({montagemBancada:null,montagemDiaProgramado:new Date('2026-09-15T00:00:00Z')}));
 expect(escritas.some(d=>d.status==='MONTAGEM')).toBe(false);
});
it('bloqueia lote misto na bancada antes de escrever qualquer bloco',async()=>{
 await expect(aplicarRemanejo([{setor:'SOLDA',ids:['s1'],recurso:'B1',dia:'2026-09-15'},bloco(['C01','C02'],'B1')],usuario)).rejects.toThrow(/C02/);
 expect(mockPrisma.pecaConjunto.updateMany).not.toHaveBeenCalled();
});
it('libera somente o conjunto apto selecionado e preserva os pendentes',async()=>{
 await aplicarRemanejo([bloco(['C01'],'B1')],usuario);
 const chamadas=mockPrisma.pecaConjunto.updateMany.mock.calls.map(([x])=>x);
 expect(chamadas.every(x=>x.where.id.in.every(id=>id==='C01'))).toBe(true);
 expect(chamadas).toContainEqual(expect.objectContaining({data:expect.objectContaining({status:'MONTAGEM',ultimoSetor:'Montagem'})}));
});
it('recusa conjunto sem croquis na bancada',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([{...conjunto('C03',false),conjuntoCroquis:[]}]);
 await expect(aplicarRemanejo([bloco(['C03'],'B1')],usuario)).rejects.toThrow(/croqui/i);
});
it('preserva remanejo de conjunto que já está liberado para montagem',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([{...conjunto('C01',false),status:'MONTAGEM'}]);
 await expect(aplicarRemanejo([bloco(['C01'],'B2')],usuario)).resolves.toMatchObject({total:1});
});
it('recusa ids fora da LPC sem realizar gravação',async()=>{
 mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
 await expect(aplicarRemanejo([bloco(['fora'])],usuario)).rejects.toThrow();
 expect(mockPrisma.pecaConjunto.updateMany).not.toHaveBeenCalled();
});
it('distingue ausência de croqui de corte parcial',()=>{
 expect(prontidaoDoGantt({...conjunto('C03',false),conjuntoCroquis:[]})).toMatchObject({pronto:false,total:0,motivo:'Sem croquis vinculados'});
 expect(prontidaoDoGantt(conjunto('C02',false))).toMatchObject({pronto:false,total:1,cortados:0});
 expect(itemAptoMontagem({})).toBe(false);
});
it.each([{corteConcluidoEm:'2026-09-09'},{baixaSetores:{CORTE:{qtd:2}}}])('aceita apontamento de corte concluído mesmo antes do sync de quantidade: %j',apontamento=>{
 const c=conjunto('C01',false);
 Object.assign(c.conjuntoCroquis[0].croqui,apontamento);
 expect(prontidaoDoGantt(c).pronto).toBe(true);
});
