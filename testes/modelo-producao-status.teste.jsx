// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import ModeloClient from '../app/producao/modelo/ModeloClient';
const indice=[{id:1,marca:' t112a1 ',tipo:'Viga',pecas:1},{id:2,marca:'T112A2',tipo:'Viga',pecas:1}];
vi.mock('@/components/VisualizadorIfc',()=>({default:function Modelo(props){React.useEffect(()=>{props.onIndice({indice,niveis:[]});},[]);return <div data-testid="selecao">{props.visiveis ? [...props.visiveis].join(',') : 'todos'}</div>;}}));
beforeEach(()=>{globalThis.React=React;vi.stubGlobal('matchMedia',()=>({matches:false}));vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>String(url).includes('/niveis')?{achou:false,niveis:[]}:{modelos:[{rel:'teste.ifc'}],setores:{T112A1:'Montagem',T112A2:'Preparação'},estados:{T112A1:'andando',T112A2:'andando'},apontamento:{comProducao:0,marcas:3},resumo:{prontas:0,andando:2,marcas:3}}})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('filtra só por etapa, cruza marcas normalizadas e limpa ao repetir a seleção',async()=>{
 render(<ModeloClient ops={[{id:'112',numero:'112'}]}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Níveis e tipos'}));
 fireEvent.click(await screen.findByRole('button',{name:/Montagem/}));
 await waitFor(()=>expect(screen.getByTestId('selecao').textContent).toBe('1'));
 fireEvent.click(screen.getByRole('button',{name:/Preparação/}));
 expect(screen.getByTestId('selecao').textContent).toBe('2');
 fireEvent.click(screen.getByRole('button',{name:/Preparação/}));
 expect(screen.getByTestId('selecao').textContent).toBe('todos');
});
it('conta o andamento somente dos itens do modelo e não descarta preparação herdada',async()=>{
 render(<ModeloClient ops={[{id:'112',numero:'112'}]}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Andamento'}));
 await screen.findByText('2 em fabricação');
 expect(screen.queryByText(/sem etapa identificada/)).toBeNull();
 expect(screen.getByText('0 sem informação')).toBeTruthy();
});
