import {it,expect} from 'vitest';
import {fracionarItem,agruparFracoes,removerFracoes} from '@/lib/gantt-fracoes';
import {destinosFinais} from '@/lib/gantt-destinos';
import {criarQuebra} from '@/app/pcp/producao/_gantt/quebra';
import {criarLotes} from '@/app/pcp/producao/_gantt/lotes';

it('reparte a OP115 em dez dias conservando as 50 unidades, o peso e o custo',()=>{
 const quebra=criarQuebra({DIAS:Array.from({length:10},(_,i)=>String(i)),capDe:()=>1,custoItem:i=>i.c,carga:()=>0,diasDaQuebra:(_,n)=>Array.from({length:n},(_,i)=>i)});
 const r={setor:'SOLDA',ini:0,lotes:[{uid:'l1'}],itens:[{id:'a1',m:'T115A1',q:44,kg:5777,c:8.8},{id:'a2',m:'T115A2',q:6,kg:322,c:0.6}]};
 const plano=quebra.fatiar(r,['SOLDA 2'],10);
 expect(plano.usados).toBe(10);
 expect(Math.max(...plano.slots.map(s=>s.carga))).toBeLessThanOrEqual(1.00001);
 const itens=plano.slots.flatMap(s=>s.itens);
 expect(itens.reduce((s,i)=>s+i.q,0)).toBe(50);
 expect(itens.reduce((s,i)=>s+i.kg,0)).toBeCloseTo(6099,8);
 expect(itens.reduce((s,i)=>s+i.c,0)).toBeCloseTo(9.4,8);
 const unidades=itens.flatMap(i=>Array.from({length:i.q},(_,n)=>i.id+':'+(i.inicioUnidade+n)));
 expect(new Set(unidades).size).toBe(50);
});
it('divide somente o custo pendente, sem duplicar as unidades já apontadas',()=>{
 const i={id:'x',q:4,f:3,kg:400,c:0.5};
 const feitos=fracionarItem(i,0,3), falta=fracionarItem(i,3,1);
 expect(feitos).toMatchObject({q:3,f:3,kg:300,c:0});
 expect(falta).toMatchObject({q:1,f:0,kg:100,c:0.5,inicioUnidade:3});
});
it('reagrupa somente unidades contíguas da mesma marca na mesma célula',()=>{
 const itens=[{id:'x',inicioUnidade:0,q:1,kg:10,c:0.1},{id:'x',inicioUnidade:1,q:1,kg:10,c:0.1},{id:'x',inicioUnidade:3,q:1,kg:10,c:0.1}];
 expect(agruparFracoes(itens)).toMatchObject([{id:'x',inicioUnidade:0,q:2,kg:20},{id:'x',inicioUnidade:3,q:1,kg:10}]);
});
it('desfazer uma fração preserva as outras unidades da marca',()=>{
 const restantes=removerFracoes([{id:'x',inicioUnidade:0,q:10,kg:100,c:1}], [{id:'x',inicioUnidade:3,q:4}]);
 expect(restantes).toMatchObject([{id:'x',inicioUnidade:0,q:3,kg:30},{id:'x',inicioUnidade:7,q:3,kg:30}]);
});
it('salva destinos distintos da mesma marca e só substitui unidades movidas novamente',()=>{
 const b=(inicio,quantidade,dia)=>({setor:'SOLDA',ids:['x'],fracoes:[{id:'x',inicio,quantidade}],dia,recurso:'SOLDA 2'});
 const r=destinosFinais([b(0,5,'2026-09-10'),b(5,5,'2026-09-11'),b(2,2,'2026-09-12')]);
 expect(r.flatMap(b=>b.fracoes.map(f=>({...f,dia:b.dia})))).toEqual(expect.arrayContaining([
  {id:'x',inicio:0,quantidade:2,dia:'2026-09-10'},{id:'x',inicio:4,quantidade:1,dia:'2026-09-10'},
  {id:'x',inicio:5,quantidade:5,dia:'2026-09-11'},{id:'x',inicio:2,quantidade:2,dia:'2026-09-12'},
 ]));
 expect(r.flatMap(b=>b.fracoes).reduce((s,f)=>s+f.quantidade,0)).toBe(10);
});
it('recalcular as células após dividir conserva peso e custo pequenos usados na ocupação',()=>{
 const {recalc}=criarLotes({});
 const lotes=Array.from({length:4},(_,n)=>recalc({itens:[{id:'x',inicioUnidade:n,q:1,kg:0.4,c:0.004}]}));
 expect(lotes.reduce((s,l)=>s+l.kg,0)).toBeCloseTo(1.6,10);
 expect(lotes.reduce((s,l)=>s+l.custo,0)).toBeCloseTo(0.016,10);
});
it('mantém retorno de terceiro indivisível mesmo sem flag de origem na barra',()=>{
 const quebra=criarQuebra({DIAS:['d1','d2'],capDe:()=>1,custoItem:i=>i.c,carga:()=>0,diasDaQuebra:()=>[0,1]});
 const r={setor:'SOLDA',ini:0,lotes:[{uid:'l1'}],itens:[{id:'retorno:r1:x:0',q:44,kg:100,c:8.8}]};
 const plano=quebra.fatiar(r,['SOLDA 1'],2);
 expect(plano.usados).toBe(1);
 expect(plano.slots.flatMap(s=>s.itens)).toHaveLength(1);
});
