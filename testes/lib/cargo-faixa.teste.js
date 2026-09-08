import {describe,it,expect} from 'vitest';
import {faixaForaDeOrdem} from '@/lib/cargo-faixa';
describe('faixa salarial do cargo',()=>{
 it('aceita a escada em ordem e a faixa toda vazia',()=>{
  expect(faixaForaDeOrdem({salarioBase:3900,salarioMedio:4492,salarioMaximo:5100})).toBeNull();
  expect(faixaForaDeOrdem({})).toBeNull();
  expect(faixaForaDeOrdem()).toBeNull();
 });
 it('aceita valores iguais — faixa achatada é decisão do RH, não erro',()=>{
  expect(faixaForaDeOrdem({salarioBase:4000,salarioMedio:4000,salarioMaximo:4000})).toBeNull();
 });
 it('recusa cada degrau fora de ordem, dizendo qual',()=>{
  expect(faixaForaDeOrdem({salarioBase:4000,salarioMedio:3000})).toMatch(/médio/);
  expect(faixaForaDeOrdem({salarioMedio:4000,salarioMaximo:3000})).toMatch(/máximo.*médio/);
  expect(faixaForaDeOrdem({salarioBase:4000,salarioMaximo:3000})).toMatch(/máximo.*base/);
 });
 it('não inventa comparação com o campo que ficou em branco',()=>{
  expect(faixaForaDeOrdem({salarioBase:5000,salarioMaximo:9000})).toBeNull();
  expect(faixaForaDeOrdem({salarioMedio:5000})).toBeNull();
 });
});
