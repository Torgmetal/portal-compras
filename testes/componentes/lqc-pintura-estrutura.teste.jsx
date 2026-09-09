// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { calcularLqc } from '@/lib/lqc';
import { Pintura } from '@/app/comercial/orcamentos/estudos/[id]/_componentes/Pintura';
import { Resumos } from '@/app/comercial/orcamentos/estudos/[id]/_componentes/Resumos';
vi.mock('@/app/comercial/orcamentos/estudos/[id]/_componentes/CotacaoTinta',()=>({CotacaoTinta:()=> <div>Cotação real</div>}));
globalThis.React = React;
afterEach(cleanup);
const inicial={ resumos:[{ id:'a',area:'Área com nome completo',estrutura:'COBERTURA',pesoTotal:100,areaM2:10,cor:'Azul'}], tintas:[],faturamento:{materiaPrima:'TORG'} };
function Tela({quantitativo=false,onChange=()=>{},composicao=inicial}){
 const [c,setC]=useState(composicao);
 const setComp=patch=>setC(v=>{const next={...v,...patch};onChange(next);return next;});
 return quantitativo ? <Resumos e={{}} c={c} setComp={setComp} res={calcularLqc(c)}/> : <Pintura estudoId="teste" c={c} res={calcularLqc(c)} setComp={setComp}/>;
}
describe('pintura e tipos reais',()=>{
 it('inclui quatro demãos persistidas, muda apenas uma perda e mantém faturamento do aço',()=>{
  const mudou=vi.fn();render(<Tela onChange={mudou}/>);
  fireEvent.click(screen.getByRole('button',{name:'Adicionar primeira demão'}));
  for(let i=0;i<3;i++) fireEvent.click(screen.getByRole('button',{name:'Adicionar demão'}));
  fireEvent.change(screen.getByLabelText('Perda desta demão'),{target:{value:'32'}});
  fireEvent.change(screen.getByLabelText('Compra da tinta'),{target:{value:'TORG'}});
  const c=mudou.mock.calls.at(-1)[0];
  expect(c.tintas).toHaveLength(4);expect(new Set(c.tintas.map(t=>t.id)).size).toBe(4);
  expect(c.tintas.map(t=>Number(t.perda))).toEqual([45,45,45,32]);
  expect(c.faturamento.materiaPrima).toBe('TORG');
  expect(screen.queryByText(/mão de obra/i)).toBeNull();
  expect(screen.queryByLabelText(/Custo manual/)).toBeNull();
 });
 it('permite escolher consumo quando custo histórico torna o preço por litro inoperante',()=>{
  const mudou=vi.fn();const tinta={camada:'PRIMER',perda:45,precoKg:2,solidos:60,peliculaSeca:60,precoLitro:30};
  render(<Tela onChange={mudou} composicao={{...inicial,tintas:[tinta,{...tinta,camada:'INTERMEDIÁRIO'}]}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Calcular produtos pelo consumo'}));
  expect(mudou.mock.calls.at(-1)[0].tintas.map(t=>t.precoKg)).toEqual([null,null]);
  expect(screen.queryByRole('button',{name:'Calcular produtos pelo consumo'})).toBeNull();
 });
 it('cadastra nome de estrutura do cliente com ID e equivalência persistidos juntos',()=>{
  const mudou=vi.fn();render(<Tela quantitativo onChange={mudou}/>);
  fireEvent.click(screen.getByRole('button',{name:'Selecionar tipo de estrutura'}));
  fireEvent.click(screen.getByRole('button',{name:'Incluir tipo de estrutura'}));
  fireEvent.change(screen.getByLabelText('Nome do novo tipo'),{target:{value:'Pipe rack Horizonte'}});
  fireEvent.change(screen.getByLabelText('Classificação técnica'),{target:{value:'COBERTURA'}});
  fireEvent.click(screen.getByRole('button',{name:'Incluir e usar nesta área'}));
  const c=mudou.mock.calls.at(-1)[0];
  expect(c.tiposEstrutura[0]).toMatchObject({nome:'Pipe rack Horizonte',base:'COBERTURA'});
  expect(c.resumos[0]).toMatchObject({estrutura:'COBERTURA',estruturaNome:'Pipe rack Horizonte',estruturaTipoId:c.tiposEstrutura[0].id});
 });
});
