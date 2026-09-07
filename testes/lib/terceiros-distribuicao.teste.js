import {describe,it,expect} from 'vitest';
import {itensRetornoSelecionados as preparar} from '@/lib/terceiros-distribuicao';
const linha={marca:'M1',saldo:30,qte:20,selecionada:true,dividir:false,distribuicao:[]};
describe('destino geral do recebimento',()=>{
 it('aplica um único setor a todas as marcas selecionadas e ignora as desmarcadas',()=>{
  expect(preparar([linha,{...linha,marca:'M2',qte:5},{...linha,marca:'M3',selecionada:false}], 'SOLDA')).toEqual([{marca:'M1',qte:20,destino:'SOLDA'},{marca:'M2',qte:5,destino:'SOLDA'}]);
 });
 it('calcula o restante automaticamente e mantém exceções ao trocar o destino geral',()=>{
  const linhas=[{...linha,dividir:true,distribuicao:[{qte:5,destino:'PINTURA'},{qte:3,destino:'JATO'}]}];
  expect(preparar(linhas,'SOLDA')).toEqual([{marca:'M1',qte:12,destino:'SOLDA'},{marca:'M1',qte:5,destino:'PINTURA'},{marca:'M1',qte:3,destino:'JATO'}]);
  expect(preparar(linhas,'ACABAMENTO')[0]).toEqual({marca:'M1',qte:12,destino:'ACABAMENTO'});
 });
 it('permite enviar toda uma marca para outro setor sem registrar quantidade zero',()=>{
  expect(preparar([{...linha,dividir:true,distribuicao:[{qte:20,destino:'PINTURA'}]}],'SOLDA')).toEqual([{marca:'M1',qte:20,destino:'PINTURA'}]);
 });
 it('bloqueia seleção vazia, destino ausente, saldo excessivo e quantidades fracionárias',()=>{
  expect(()=>preparar([],'SOLDA')).toThrow();expect(()=>preparar([linha],'')).toThrow();
  for(const qte of [0,31,1.5])expect(()=>preparar([{...linha,qte}],'SOLDA')).toThrow();
 });
 it('não aceita separação excessiva, repetida ou igual ao destino geral',()=>{
  for(const distribuicao of [[{qte:21,destino:'PINTURA'}],[{qte:2,destino:'SOLDA'}],[{qte:2,destino:'JATO'},{qte:3,destino:'JATO'}],[{qte:0,destino:'PINTURA'}],[{qte:2,destino:''}]])expect(()=>preparar([{...linha,dividir:true,distribuicao}],'SOLDA')).toThrow();
 });
});
