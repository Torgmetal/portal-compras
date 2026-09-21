// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import FilaDecisao from '@/app/pcp/FilaDecisao';
globalThis.React=React;
vi.mock('next/link',()=>({default:({children,...props})=><a {...props}>{children}</a>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const ops=[{opId:'a',opNumero:'112'},{opId:'b',opNumero:'94'}];
const dados=(marca)=>({ok:true,json:async()=>({pecas:[{id:'1',marca,qte:4}],decisao:{porId:{'1':{estado:'LIBERAR',saldo:4,motivos:[],rs:[]}}}})});
it('resposta atrasada da OP anterior não troca a fila que o PCP acabou de escolher',async()=>{
 let resolverA;
 const fetch=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{resolverA=resolve;})).mockResolvedValueOnce(dados('B-01'));
 vi.stubGlobal('fetch',fetch);render(<FilaDecisao ops={ops}/>);
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'b'}});
 await screen.findByText('B-01');await act(async()=>resolverA(dados('A-01')));
 await waitFor(()=>expect(screen.queryByText('A-01')).toBeNull());
 expect(screen.getByText('B-01')).toBeTruthy();
 expect(fetch.mock.calls[1][0]).toContain('opId=b');
 expect(screen.getByRole('link',{name:'Abrir peças desta fila'}).getAttribute('href')).toContain('opId=b&setor=CORTE&fila=LIBERAR');
});
it('não deixa os números da resposta anterior parecerem atuais durante erro e permite tentar novamente',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(dados('A-01')).mockRejectedValueOnce(new Error('Consulta falhou')).mockResolvedValueOnce(dados('A-02')));
 render(<FilaDecisao ops={ops}/>);await screen.findByText('A-01');
 fireEvent.click(screen.getByRole('button',{name:'Atualizar conferências'}));await screen.findByText('Consulta falhou');
 expect(screen.queryByText('A-01')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await screen.findByText('A-02');
});
