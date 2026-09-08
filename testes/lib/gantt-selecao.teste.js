import { it, expect } from 'vitest';
import { filtrarProjetos, recortarProgramacao } from '@/app/pcp/producao/_gantt/selecao-projetos';
const itens=[{id:'1',m:'P1',pf:'CH4.75',mt:'A36',q:2,kg:20,c:1,f:0},{id:'2',m:'P2',pf:'U200',mt:'A572',q:1,kg:30,c:2,f:0},{id:'3',m:'P3',pf:'CH4.75',q:1,kg:10,c:1,f:1,g:{em:'2026-09-08'}}];
it('combina busca, perfil, aço e GRD sem modificar os itens',()=>{
 expect(filtrarProjetos(itens,{busca:'ch',perfil:'CH4.75',material:'A36',soFalta:true})).toEqual([itens[0]]);
 expect(filtrarProjetos(itens,{busca:'inexistente'})).toEqual([]);
 expect(filtrarProjetos(itens,{material:'__SEM__'})).toEqual([itens[2]]);
});
it('recorta a seleção por id e preserva bancada/dia dos itens restantes',()=>{
 const lotes=[{uid:1,recurso:'B1',dia:'2026-09-08',itens:itens.slice(0,2)},{uid:2,recurso:'B2',dia:'2026-09-09',itens:[itens[2]]}];
 const r=recortarProgramacao({itens,lotes,pecas:4,kg:60},new Set(['1']));
 expect(r.itens).toEqual([itens[0]]);expect(r.pecas).toBe(2);expect(r.kg).toBe(20);expect(r.parcial).toBe(true);
 expect(r.restantes.map(l=>[l.recurso,l.dia,l.itens.map(i=>i.id)])).toEqual([['B1','2026-09-08',['2']],['B2','2026-09-09',['3']]]);
 expect(r.lotes[0].itens).toEqual([itens[0]]);expect(lotes[0].itens).toHaveLength(2);
});
it('seleção vazia não vira o lote inteiro',()=>{
 const r=recortarProgramacao({itens,lotes:[{uid:1,itens}]},new Set());
 expect(r.itens).toEqual([]);expect(r.pecas).toBe(0);
});
it('desconta a carga das peças que permanecem na bancada ao dividir uma seleção',async()=>{
 const {criarQuebra}=await import('@/app/pcp/producao/_gantt/quebra');
 const dep={capDe:()=>10,DIAS:['2026-09-08'],diasDaQuebra:()=>[0],carga:()=>0,custoItem:i=>i.c};
 const todas=[{id:'sel',q:1,kg:1,c:3},{id:'fica',q:1,kg:1,c:8}];
 const r=recortarProgramacao({itens:todas,lotes:[{uid:'l',recurso:'B1',dia:'2026-09-08',itens:todas}],setor:'MONTAGEM',ini:0},new Set(['sel']));
 const plano=criarQuebra(dep).fatiar(r,['B1','B2'],1);
 expect(plano.slots.find(s=>s.recurso==='B1').base).toBe(8);
 expect(plano.slots.find(s=>s.recurso==='B2').itens.map(i=>i.id)).toEqual(['sel']);
});
it('combina listas de valores por coluna e distingue filtro vazio de todos',()=>{
 expect(filtrarProjetos(itens,{colunas:{pf:['CH4.75','U200'],mt:['A36','A572']}})).toEqual(itens.slice(0,2));
 expect(filtrarProjetos(itens,{colunas:{pf:[]}})).toEqual([]);
 expect(filtrarProjetos(itens,{colunas:{pf:null,mt:['__SEM__']}})).toEqual([itens[2]]);
 expect(filtrarProjetos(itens,{colunas:{m:['P1','P3'],pf:['CH4.75']}})).toEqual([itens[0],itens[2]]);
});
