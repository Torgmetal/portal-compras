// @vitest-environment jsdom
import React from 'react';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import {render, screen, fireEvent, waitFor, cleanup} from '@testing-library/react';
import Seletor from '@/app/planejamento/datas-setor/SeletorRMaterial';
const fardos=Array.from({length:450},(_,i)=>({id:String(i),r:String(260000+i),opNumero:i===449?'113':'097',descricao:i===449?'CHAPA aço A36 9,50':'CHAPA A36',pesoKg:150,recebidoEm:'2026-09-08'}));
const material={perfil:'CH9.50',marcas:4,pesoKg:300};
let fetchMock;
beforeEach(()=>{globalThis.React=React;fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({fardos})});vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('pesquisa o último R, mantém a seleção ao filtrar e grava apenas o R escolhido',async()=>{
 const salvo=vi.fn();render(<Seletor material={material} opNumero="097" onClose={()=>{}} onSaved={salvo}/>);
 await screen.findByText('R 260449');
 fireEvent.change(screen.getByLabelText('Buscar R, OP ou descrição'),{target:{value:'113 aço'}});
 expect(screen.queryByText('R 260000')).toBeNull();
 fireEvent.click(screen.getByText('R 260449'));
 fireEvent.change(screen.getByLabelText('Buscar R, OP ou descrição'),{target:{value:'260000'}});
 expect(screen.getByText('Selecionado: R 260449 · OP 113')).toBeTruthy();
 fireEvent.click(screen.getByText('Usar este R'));
 await waitFor(()=>expect(salvo).toHaveBeenCalledTimes(1));
 expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({opNumero:'097',perfil:'CH9.50',rUsado:'260449'});
});
it('mostra falha de gravação no próprio seletor',async()=>{
 render(<Seletor material={material} opNumero="097" onClose={()=>{}} onSaved={vi.fn()}/>);
 fireEvent.click(await screen.findByText('R 260449'));
 fetchMock.mockResolvedValueOnce({ok:false,json:async()=>({error:'Material incompatível'})});
 fireEvent.click(screen.getByText('Usar este R'));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Material incompatível ');
});
it('não permite salvar enquanto não selecionar um recebimento',async()=>{
 render(<Seletor material={material} opNumero="097" onClose={()=>{}} onSaved={vi.fn()}/>);
 await screen.findByText('R 260449');expect(screen.getByText('Usar este R').disabled).toBe(true);
});
