import {describe,it,expect} from 'vitest';
import {linhasDaTabela,conferirItensTerceiro} from '@/lib/terceiros-importar-itens';
const catalogo=[{id:'1',marca:'T97A4',opNumero:'T097A',qte:10,pesoUnitKg:12.5,pesoTotalKg:125,descricao:'Viga'},{id:'2',marca:'0012',opNumero:'T097A',qte:2,pesoTotalKg:60,descricao:'Chapa'}];
describe('lista de material enviado a terceiros',()=>{
 it('lê marca e quantidade de lista colada e preserva zeros',()=>{
  expect(linhasDaTabela([['Marca','Qtd'],['T97A4','3'],['0012','1']])).toMatchObject([{marca:'T97A4',qte:'3'},{marca:'0012',qte:'1'}]);
 });
 it('aceita só marcas e sinaliza uso da quantidade total da OP',()=>{
  const [r]=conferirItensTerceiro(linhasDaTabela([['T97A4']]),catalogo,'097');
  expect(r.ok).toBe(true);expect(r.item).toMatchObject({marca:'T97A4',qte:10,pesoTotal:125,descricao:'Viga'});expect(r.avisos.join(' ')).toContain('quantidade da OP');
 });
 it('calcula peso proporcional para envio parcial',()=>{
  const [r]=conferirItensTerceiro([{marca:'T97A4',qte:3}],catalogo,'097');expect(r.item.pesoTotal).toBe(37.5);
 });
 it('usa peso total dividido pela quantidade quando não há peso unitário',()=>{
  expect(conferirItensTerceiro([{marca:'0012',qte:1}],catalogo,'097')[0].item.pesoTotal).toBe(30);
 });
 it('respeita peso total informado em formato brasileiro',()=>{
  const l=linhasDaTabela([['Marca','Quantidade','Peso total (kg)'],['T97A4',2,'1.234,56']]);
  expect(conferirItensTerceiro(l,catalogo,'097')[0].item.pesoTotal).toBe(1234.56);
 });
 it('não confunde OPs, marcas desconhecidas ou marcas ambíguas',()=>{
  expect(conferirItensTerceiro([{op:'098',marca:'T97A4',qte:1}],catalogo,'097')[0].ok).toBe(false);
  expect(conferirItensTerceiro([{marca:'SEM',qte:1}],catalogo,'097')[0].ok).toBe(false);
  expect(conferirItensTerceiro([{marca:'T97A4',qte:1}],[...catalogo,{...catalogo[0],id:'3',opNumero:'T097B'}],'097')[0].ok).toBe(false);
 });
 it('recusa quantidade inválida, fracionada ou acima da OP',()=>{
  for(const qte of [0,-1,'2abc',1.5,11])expect(conferirItensTerceiro([{marca:'T97A4',qte}],catalogo,'097')[0].ok).toBe(false);
 });
 it('recusa todas as ocorrências duplicadas sem somar silenciosamente',()=>{
  const r=conferirItensTerceiro([{marca:'T97A4',qte:1},{marca:'t97a4',qte:2}],catalogo,'097');expect(r.every(x=>!x.ok)).toBe(true);
 });
 it('recusa peso inválido e coluna de peso ambígua',()=>{
  expect(conferirItensTerceiro([{marca:'T97A4',qte:1,pesoTotal:'abc'}],catalogo,'097')[0].ok).toBe(false);
  expect(()=>linhasDaTabela([['Marca','Peso'],['T97A4',4]])).toThrow(/total|unitário/);
 });
 it('reconhece abreviações comuns e não ignora colunas de medidas desconhecidas',()=>{
  const r=conferirItensTerceiro(linhasDaTabela([['Marca','Qtd.','Peso unit. (kg)'],['T97A4',2,'12,50']]),catalogo,'097');expect(r[0].item).toMatchObject({qte:2,pesoTotal:25});
  expect(()=>linhasDaTabela([['Marca','Qtd a enviar'],['T97A4',2]])).toThrow(/Coluna/);
 });
 it('exige cabeçalho quando há mais colunas além de marca e quantidade',()=>{
  expect(()=>linhasDaTabela([['T97A4','Viga',3,60]])).toThrow(/cabeçalho/);
 });
});
