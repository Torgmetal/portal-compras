// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import Painel from '@/app/producao/PainelProducaoClient';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
beforeEach(()=>{globalThis.React=React;});afterEach(cleanup);
const props={hoje:'2026-09-12',dia:12,diasNoMes:30,pipe:Object.fromEntries(['CORTE','MONTAGEM','SOLDA','ACABAMENTO','JATO','PINTURA','EXPEDIDO'].map(s=>[s,{pecas:1,kg:10}])),setores:[{setor:'Solda',hojeKg:10,hojeUn:2,mesKg:100,metaKg:200}],semanas:[],furos:[],paradas:0,solicitacoes:[]};
it('organiza a consulta em abas e oferece acessos operacionais reais',()=>{
 render(<Painel {...props}/>);
 expect(screen.getByRole('link',{name:/Ordens e peças/}).getAttribute('href')).toBe('/producao/ordens');
 fireEvent.click(screen.getByRole('tab',{name:'Resultados'}));
 expect(screen.getByText('Meta × realizado no mês (Syneco)')).toBeTruthy();
 expect(screen.queryByText('Fluxo da fábrica')).toBeNull();
 fireEvent.click(screen.getByRole('tab',{name:'Solicitações'}));
 expect(screen.getByText('Nenhuma solicitação de produção pendente.')).toBeTruthy();
});
it('não chama ausência de atualização de parada física',()=>{
 render(<Painel {...props} paradas={3}/>);
 expect(screen.getByText(/3 registros sem atualização há mais de 1 dia/)).toBeTruthy();
 expect(screen.queryByText(/3 peças paradas/)).toBeNull();
});
