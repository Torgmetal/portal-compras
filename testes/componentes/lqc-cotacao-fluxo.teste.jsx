// @vitest-environment jsdom
import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {CotacaoTinta} from '@/app/comercial/orcamentos/estudos/[id]/_componentes/CotacaoTinta';
globalThis.React=React;
vi.mock('@/lib/store',()=>({useStore:()=>({showToast:vi.fn()})}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const c={resumos:[{area:'Galpão completo',estrutura:'COBERTURA',pesoTotal:100,areaM2:1200}],tintas:[{camada:'PRIMER',solidos:60,peliculaSeca:100,perda:45,precoL:50}]};
describe('cotação real com revisão',()=>{
 it('calcula área legada, inicia sem fornecedor e só envia após revisão do conteúdo específico',async()=>{
 const chamadas=[];vi.stubGlobal('fetch',vi.fn(async(url,op)=>{
  if(!op)return {ok:true,json:async()=>({fornecedores:[{id:'weg',nome:'Fornecedor WEG',email:'qa@example.invalid',fabricanteTinta:'WEG'},{id:'jotun',nome:'Fornecedor Jotun',email:'outro@example.invalid',fabricanteTinta:'JOTUN'}],boletins:[],cotacoes:[]})};
  const b=JSON.parse(op.body);chamadas.push(b);return {ok:true,json:async()=>b.previa?{confirmacao:'confirmacao-servidor',destinatarios:[{fornecedorId:'weg',nome:'Fornecedor WEG',email:'qa@example.invalid',mensagem:{subject:'Requisitos',html:'<p>Produto a especificar</p>'}}]}:{enviados:1,convidados:1}};
 }));
 render(<CotacaoTinta estudoId="teste" c={c}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Preparar cotação'}));
 expect(screen.getByText('1.200 m²')).toBeTruthy();expect(screen.getByText(/Galpão completo/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Escolher fornecedores'}));
 expect(screen.getByLabelText('Fornecedor WEG').checked).toBe(false);
 expect(screen.getByLabelText('Fornecedor Jotun').checked).toBe(false);
 fireEvent.click(screen.getByLabelText('Fornecedor WEG'));
 fireEvent.change(screen.getByLabelText('Responder até'),{target:{value:'2026-09-20'}});
 fireEvent.click(screen.getByRole('button',{name:'Revisar mensagens'}));
 await screen.findByTitle('Prévia do e-mail de cotação');
 expect(chamadas).toHaveLength(1);expect(chamadas[0].previa).toBe(true);expect(chamadas[0].fornecedorIds).toEqual(['weg']);
 expect(chamadas[0].snapshot.camadas[0]).toMatchObject({areaM2:1200,destino:'Galpão completo · Cobertura'});
 expect(JSON.stringify(chamadas[0])).not.toContain('precoL');
 fireEvent.click(screen.getByRole('button',{name:'Enviar cotação (1)'}));
 await waitFor(()=>expect(chamadas).toHaveLength(2));expect(chamadas[1].confirmacao).toBe('confirmacao-servidor');expect(chamadas[1].previa).toBe(false);
 });
});
