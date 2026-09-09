// @vitest-environment jsdom
import React, { useState } from 'react';
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ItensComerciais } from '@/app/comercial/orcamentos/estudos/[id]/_componentes/ItensComerciais';
beforeEach(()=>vi.stubGlobal('React',React));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('persiste custos sem nome, múltiplos modelos e frete, sem consultar histórico',()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 let salvo;
 function Tela(){const [c,setC]=useState({});salvo=c;return <ItensComerciais c={c} res={{}} setComp={p=>setC(a=>({...a,...p}))}/>;}
 const view=render(<Tela/>);
 fireEvent.change(screen.getByLabelText('Quantidade do item 1 de Telhas'),{target:{value:'10'}});
 fireEvent.change(screen.getByLabelText('Custo unitário do item 1 de Telhas'),{target:{value:'20'}});
 fireEvent.click(screen.getByText('Adicionar outro modelo'));
 fireEvent.change(screen.getByLabelText('Quantidade do item 2 de Telhas'),{target:{value:'2'}});
 fireEvent.change(screen.getByLabelText('Custo unitário do item 2 de Telhas'),{target:{value:'30'}});
 fireEvent.change(screen.getByLabelText('Frete de Telhas'),{target:{value:'40'}});
 expect(screen.getByTestId('total-comerciais').textContent).toMatch(/300,00/);
 const snapshot=JSON.parse(JSON.stringify(salvo));view.unmount();
 render(<ItensComerciais c={snapshot} res={{}} setComp={()=>{}}/>);
 expect(screen.getByLabelText('Quantidade do item 2 de Telhas').value).toBe('2');
 expect(screen.getByTestId('total-comerciais').textContent).toMatch(/300,00/);
 expect(fetch).not.toHaveBeenCalled();
});
it('mostra itens antigos das mesmas famílias, por área e chumbadores fora das famílias novas',()=>{
 const c={resumos:[{area:'Área A',ativo:true}],itensComerciais:{TELHA_TERMO:{qtd:90,porArea:{'Área A':2,'Área B':8}},TELHA_SIMPLES:{qtd:3,preco:10},CHUMBADORES:{qtd:4,preco:6}}};
 render(<ItensComerciais c={c} res={{}} setComp={()=>{}}/>);
 expect(screen.getByLabelText('Quantidade do item 1 de Telhas').value).toBe('2');
 expect(screen.getByLabelText('Quantidade do item 1 de Telhas').disabled).toBe(true);
 expect(screen.getByLabelText('Quantidade do item 2 de Telhas').value).toBe('3');
 expect(screen.getByText('Chumbadores químicos')).toBeTruthy();
 expect(screen.getByTestId('total-comerciais').textContent).toMatch(/304,00/);
});
