import {it,expect} from 'vitest';
import volumes from '../fixtures/carga-reencaixe-107.json';
import {melhorArranjo} from '@/lib/carga/arranjo';
import {novoContexto} from '@/lib/carga/empacotar';
import {PERFIS} from '@/lib/carga/premissas';
import {coberturaDaBase} from '@/lib/carga/apoios';

it('acomoda os 33 volumes da OP 107 sem deixar o feixe de 90 kg em outro veículo',()=>{
 const itens=structuredClone(volumes),ctx=novoContexto({cel:50});
 // Exercita o reencaixe; a troca automática de grade tem uma regressão menor própria.
 ctx.refinarOrdens={areaLivre:(a,b)=>b.C*b.L-a.C*a.L || b.kg-a.kg};ctx.porId=new Map(itens.map(u=>[u.id,u]));
 const r=melhorArranjo(itens,PERFIS.recomendado,ctx,[]);
 expect(r.cargas).toHaveLength(1);
 const c=r.cargas[0];expect(c.itens.map(u=>u.id).sort()).toEqual(volumes.map(u=>u.id).sort());
 for(const u of c.itens){
  expect(u.x).toBeGreaterThanOrEqual(0);expect(u.z).toBeGreaterThanOrEqual(0);
  expect(u.x+u.fx).toBeLessThanOrEqual(c.veic.C);expect(u.z+u.fz).toBeLessThanOrEqual(c.veic.L);
  expect(u.y+u.A).toBeLessThanOrEqual(c.veic.alturaUtil);
  if(u.y>0){const apoios=c.itens.filter(b=>b.id!==u.id&&!b.baseEmV&&Math.abs(b.y+b.A+100-u.y)<2);expect(coberturaDaBase(u,apoios).suficiente).toBe(true);}
 }
},120000);
