// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import Vagas from '@/app/rh/vagas/VagasClient';
const vaga={id:'v1',titulo:'Auxiliar Geral',setor:{id:'s1',nome:'Expedição'},quantidade:3,quantidadePreenchida:0,status:'EM_RECRUTAMENTO',dataAbertura:'2026-08-13',updatedAt:'2026-09-08T12:00:00.000Z'};
let fetchMock;
beforeEach(()=>{globalThis.React=React;fetchMock=vi.fn(async(url,opts)=>({ok:true,json:async()=>({success:true,data:opts?.method==='PATCH'?{...vaga,quantidadePreenchida:JSON.parse(opts.body).quantidadeContratada,status:JSON.parse(opts.body).quantidadeContratada===3?'PREENCHIDA':'EM_RECRUTAMENTO'}:String(url).includes('/vagas')?[vaga]:[]})}));vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('registra 1 de 3, mantém cartão e contador com 2 vagas abertas',async()=>{
 render(<Vagas/>);fireEvent.click(await screen.findByText('Registrar contratação'));
 expect(screen.getByText(/2 vagas continuarão/)).toBeTruthy();
 fireEvent.click(screen.getByText('Confirmar contratação'));
 await screen.findByText('2 vagas abertas');expect(screen.getByText('Auxiliar Geral')).toBeTruthy();
 const body=JSON.parse(fetchMock.mock.calls.find(([,opts])=>opts?.method==='PATCH')[1].body);
 expect(body).toMatchObject({quantidadeContratada:1,versaoEsperada:vaga.updatedAt});
});
it('encerra ao contratar as 3 e tira da lista padrão',async()=>{
 render(<Vagas/>);fireEvent.click(await screen.findByText('Registrar contratação'));
 fireEvent.change(screen.getByLabelText('Quantas pessoas foram contratadas agora?'),{target:{value:'3'}});
 expect(screen.getByText(/pedido será encerrado/)).toBeTruthy();fireEvent.click(screen.getByText('Confirmar contratação'));
 await screen.findByText('0 vagas abertas');expect(screen.queryByText('Auxiliar Geral')).toBeNull();
});
it('não envia baixa acima do saldo e mostra falha dentro do modal',async()=>{
 render(<Vagas/>);fireEvent.click(await screen.findByText('Registrar contratação'));
 fireEvent.change(screen.getByLabelText('Quantas pessoas foram contratadas agora?'),{target:{value:'4'}});
 expect(screen.getByText('Confirmar contratação').disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Quantas pessoas foram contratadas agora?'),{target:{value:'1'}});
 fetchMock.mockResolvedValueOnce({ok:false,json:async()=>({error:'Vaga atualizada, recarregue.'})});
 fireEvent.click(screen.getByText('Confirmar contratação'));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('recarregue'));
});
