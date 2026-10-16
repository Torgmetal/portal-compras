import {it,expect} from 'vitest';
import {melhorArranjo} from '@/lib/carga/arranjo';
import {novoContexto} from '@/lib/carga/empacotar';
import {PERFIS,VEICULOS} from '@/lib/carga/premissas';

it('escolhe um truck que acomoda a carga ao refinar o arranjo, mesmo que já caiba em uma carreta',()=>{
 // Quatro caixas no piso: duas de 1,15 m com folgas cabem na carroceria configurada de 2,50 m.
 // Na grade de 10 cm cada uma consome 1,30 m; a grade de 5 cm recupera o encaixe real.
 const itens=Array.from({length:4},(_,i)=>({id:`cx${i}`,tipo:'CAIXA',rotulo:`Caixa ${i}`,C:2500,L:1150,A:1500,kg:200,classe:0,nivel:0,soChao:true}));
 const ctx=novoContexto({veiculos:{...VEICULOS,truck:{...VEICULOS.truck,L:2500}}});
 ctx.porId=new Map(itens.map(u=>[u.id,u]));
 const r=melhorArranjo(itens,PERFIS.economico,ctx,[]);
 expect(r.cargas).toHaveLength(1);
 const c=r.cargas[0];expect(c.veicKey).toBe('truck');
 expect(c.itens.map(u=>u.id).sort()).toEqual(['cx0','cx1','cx2','cx3']);
 for(const u of c.itens){
  expect(u.x+u.fx).toBeLessThanOrEqual(8500);expect(u.z+u.fz).toBeLessThanOrEqual(2500);
  expect(u.y).toBe(0);expect(u.semLugar).toBeFalsy();
 }
},120000);

it.each(['largura','inativo','peso'])('preserva a carreta quando o truck não atende: %s',motivo=>{
 const itens=Array.from({length:4},(_,i)=>({id:`cx${i}`,tipo:'CAIXA',rotulo:`Caixa ${i}`,C:2500,L:1150,A:1500,kg:motivo==='peso'?4000:200,classe:0,nivel:0,soChao:true}));
 const veiculos={...VEICULOS,truck:{...VEICULOS.truck,L:motivo==='largura'?2450:2500}};
 if(motivo==='inativo')delete veiculos.truck;
 const ctx=novoContexto({veiculos});ctx.porId=new Map(itens.map(u=>[u.id,u]));
 const r=melhorArranjo(itens,PERFIS.economico,ctx,[]);
 expect(r.cargas).toHaveLength(1);expect(r.cargas[0].veicKey).toBe('carreta');
 expect(r.cargas[0].itens).toHaveLength(4);
 for(const u of r.cargas[0].itens){expect(u.semLugar).toBeFalsy();expect(u.x+u.fx).toBeLessThanOrEqual(12400);expect(u.z+u.fz).toBeLessThanOrEqual(2450);}
},120000);
