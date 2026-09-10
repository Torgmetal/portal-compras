import { it, expect } from 'vitest';
import { partesAtuais, moverFaixa, expandirPeca } from '@/lib/gantt-distribuicao';
const campos = { dia: 'dia', recurso: 'recurso' };
const p = { id:'p', qte:44, pesoTotalKg:4400, dia:new Date('2026-09-10'), recurso:'A' };
it('remaneja unidades mantendo o restante e usa o último destino na sobreposição', () => {
 let partes=partesAtuais(p,campos);
 partes=moverFaixa(partes,{inicio:0,quantidade:5,dia:'2026-09-11',recurso:'B'},44);
 partes=moverFaixa(partes,{inicio:3,quantidade:3,dia:'2026-09-12',recurso:'C'},44);
 expect(partes.map(x=>[x.inicio,x.quantidade,x.recurso])).toEqual([[0,3,'B'],[3,3,'C'],[6,38,'A']]);
 expect(()=>moverFaixa(partes,{inicio:43,quantidade:2},44)).toThrow();
});
it('invalida distribuição se outra tela mudar a âncora',()=>{
 expect(partesAtuais(p,campos,{ancoraDia:'2026-09-09',ancoraRecurso:'A',quantidade:44,partes:[]})).toHaveLength(1);
});
it('distribui produção cronologicamente sem duplicar peso ou unidades',()=>{
 const d={ancoraDia:p.dia,ancoraRecurso:'A',quantidade:44,partes:[{inicio:0,quantidade:4,dia:'2026-09-12',recurso:'B'},{inicio:4,quantidade:40,dia:'2026-09-10',recurso:'A'}]};
 const xs=expandirPeca(p,campos,d,42);
 expect(xs.map(x=>[x.inicioUnidade,x.qte,x.feitoDistribuido])).toEqual([[4,40,40],[0,4,2]]);
 expect(xs.reduce((s,x)=>s+x.pesoTotalKg,0)).toBe(4400);
});
