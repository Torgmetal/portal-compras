import {it,expect} from 'vitest';
import {posicaoDoArraste,sobreposicaoNoArraste} from '@/lib/carga/montagem-manual';
const veiculo={C:8500,L:2450,alturaUtil:2600};
const u={id:'a',C:1000,L:500,A:700,x:105,y:300,z:155,rotacaoManual:{x:90,y:0,z:0}};
it('arraste no piso preserva a altura e encaixa o deslocamento sem deslocar o ponto inicial',()=>{
 expect(posicaoDoArraste(u,{x:0,y:900,z:0},veiculo,'mover',50)).toEqual({x:105,y:300,z:155});
 expect(posicaoDoArraste(u,{x:78,y:900,z:-32},veiculo,'mover',50)).toEqual({x:205,y:300,z:105});
});
it('a altura é independente do movimento lateral e limitada pelas dimensões giradas',()=>{
 expect(posicaoDoArraste(u,{x:500,y:5000,z:500},veiculo,'altura',50)).toEqual({x:105,y:2100,z:155});
 expect(posicaoDoArraste(u,{x:500,y:-5000,z:500},veiculo,'altura',50)).toEqual({x:105,y:0,z:155});
});
it('mantém o volume dentro da carroceria usando largura após a rotação, também sem encaixe',()=>{
 expect(posicaoDoArraste(u,{x:9000,y:0,z:9000},veiculo,'mover',0)).toEqual({x:7500,y:300,z:1750});
 expect(posicaoDoArraste(u,{x:12,y:0,z:13},veiculo,'mover',0)).toEqual({x:117,y:300,z:168});
});
it('avisa sobreposição no espaço ocupado mas permite contato entre faces e ignora o próprio volume',()=>{
 const b={...u,id:'b',x:1500}; const carga={itens:[u,b]};
 expect(sobreposicaoNoArraste(carga,u,{x:600,y:300,z:155})).toBe(true);
 expect(sobreposicaoNoArraste(carga,u,{x:500,y:300,z:155})).toBe(false);
 expect(sobreposicaoNoArraste(carga,u,{x:105,y:300,z:155})).toBe(false);
});
it('modo livre permite retirar o pacote da carroceria para reorganizar sem perder sua altura',()=>{
 expect(posicaoDoArraste(u,{x:-2000,y:0,z:3000},veiculo,'mover',0,false)).toEqual({x:-1895,y:300,z:3155});
});
