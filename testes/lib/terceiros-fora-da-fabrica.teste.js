import {describe,it,expect} from 'vitest';
import {chavesNoTerceiro,noTerceiro} from '@/lib/terceiros-retorno';
const rt=(over={})=>({numero:3,status:'ENVIADO',opRefNumero:'097',itens:[{marca:'T97A4',qte:2,pesoTotal:70}],retornos:[],...over});
describe('marcas que estão no terceiro',()=>{
 it('tira da fábrica a marca com saldo lá fora, casando OP escrita de formas diferentes',()=>{
  const fora=chavesNoTerceiro([rt()]);
  for(const op of ['097','97','OP-97'])expect(noTerceiro(fora,op,'t97a4')).toBe(true);
 });
 it('devolve a marca quando ela volta inteira, e a mantém fora no retorno parcial',()=>{
  expect(noTerceiro(chavesNoTerceiro([rt({retornos:[{itens:[{marca:'T97A4',qte:2}]}]})]),'097','T97A4')).toBe(false);
  expect(noTerceiro(chavesNoTerceiro([rt({retornos:[{itens:[{marca:'T97A4',qte:1}]}]})]),'097','T97A4')).toBe(true);
 });
 it('ignora remessa cancelada e sem OP',()=>{
  expect(chavesNoTerceiro([rt({status:'CANCELADO'})]).size).toBe(0);
  expect(chavesNoTerceiro([rt({opRefNumero:null})]).size).toBe(0);
 });
 it('trata saldo desconhecido como fora — não se programa o que não se prova que voltou',()=>{
  expect(noTerceiro(chavesNoTerceiro([rt({itens:[{marca:'T97A4',qte:null}]})]),'097','T97A4')).toBe(true);
 });
 it('não confunde a mesma marca em outra OP',()=>{
  expect(noTerceiro(chavesNoTerceiro([rt()]),'105','T97A4')).toBe(false);
 });
});
