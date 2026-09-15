import {it,expect} from 'vitest';
import {montarUnidades} from '@/lib/carga/unidades';
import {novoContexto} from '@/lib/carga/empacotar';
import {PERFIS} from '@/lib/carga/premissas';
const p=(id,extra={})=>({id,marca:`T107A${id}`,desc:'VIGA',C:1500,L:200,A:250,kg:30,...extra});
const montar=(ps,perfil='recomendado')=>montarUnidades(ps,PERFIS[perfil],'topo',novoContexto({prefixo:'T107'}));
it('perfis curtos compatíveis viajam em feixe sem caixa fechada',()=>{
 const ps=[p('1'),p('2',{C:1400}),p('3',{C:1450})];const us=montar(ps);
 expect(us).toHaveLength(1);expect(us[0].tipo).toBe('PACOTE');expect(us[0].membros).toHaveLength(3);
 expect(us[0].kg).toBe(90);
});
it('não mistura perfis muito curtos e compridos no mesmo feixe',()=>{
 const us=montar([p('1',{C:700}),p('2',{C:700}),p('3',{C:1900}),p('4',{C:1900})]);
 expect(us).toHaveLength(2);expect(us.every(u=>u.tipo==='PACOTE')).toBe(true);
});
it('preserva caixa solicitada, perfis reforçados e medidas estimadas',()=>{
 for(const ps of [[p('1',{aj:{embalagem:'caixa'}})],[p('1',{estimada:true})]])expect(montar(ps).every(u=>u.tipo==='CAIXA')).toBe(true);
 for(const perfil of ['exigente','vale'])expect(montar([p('1'),p('2')],perfil).every(u=>u.tipo==='CAIXA')).toBe(true);
});
it('miúdos de marcas diferentes podem compartilhar uma caixa na mesma fase',()=>{
 const ps=Array.from({length:12},(_,i)=>p(String(i),{marca:i<6?'T107A1':'T107A2',desc:'BATENTE',C:100,L:60,A:30,kg:1}));
 const us=montar(ps);expect(us).toHaveLength(1);expect(us[0].membros).toHaveLength(12);
});
it('os perfis de seções diferentes não se atravessam dentro do novo feixe',()=>{
 const ps=Array.from({length:8},(_,i)=>p(String(i),i%2?{L:200,A:300}:{L:300,A:100}));
 const us=montar(ps);expect(us.flatMap(u=>u.membros).map(m=>m.id).sort()).toEqual(ps.map(m=>m.id).sort());
 for(const u of us)for(let i=0;i<u.membros.length;i++)for(let j=i+1;j<u.membros.length;j++){
  const a=u.membros[i],b=u.membros[j];
  const interY=Math.min(a.dy+a.A,b.dy+b.A)-Math.max(a.dy,b.dy);
  const interZ=Math.min(a.dz+a.L,b.dz+b.L)-Math.max(a.dz,b.dz);
  expect(interY<=0||interZ<=0).toBe(true);
 }
});
