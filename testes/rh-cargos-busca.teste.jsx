// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import Cargos from '@/app/rh/cargos/CargosClient';
const cargos=[{id:'1',nome:'Acabador Júnior',categoria:'Produção',cbo:'7251-20',nivel:'OPERACIONAL'}, {id:'2',nome:'Almoxarife Pleno',categoria:'Logística',cbo:'4141-05',nivel:'OPERACIONAL'}, {id:'3',nome:'Engenheiro Sênior',categoria:'Engenharia',nivel:'TECNICO'}];
beforeEach(()=>{globalThis.React=React;vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:cargos})}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('busca pelo nome sem depender de acentos e mantém edição do resultado',async()=>{
 render(<Cargos/>);await screen.findByText('Acabador Júnior');
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'ACABADOR junior'}});
 expect(screen.queryByText('Almoxarife Pleno')).toBeNull();expect(screen.getByText('Acabador Júnior')).toBeTruthy();
 fireEvent.click(screen.getByTitle('Editar cargo'));expect(screen.getByDisplayValue('Acabador Júnior')).toBeTruthy();
});
it('busca por categoria e CBO com ou sem hífen, sem novas requisições',async()=>{
 render(<Cargos/>);await screen.findByText('Acabador Júnior');const campo=screen.getByRole('searchbox');
 for(const termo of ['logistica','4141-05','414105']){fireEvent.change(campo,{target:{value:termo}});expect(screen.getByText('Almoxarife Pleno')).toBeTruthy();expect(screen.queryByText('Acabador Júnior')).toBeNull();}
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('informa busca sem resultado e permite limpar para recuperar a lista',async()=>{
 render(<Cargos/>);await screen.findByText('Acabador Júnior');
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'inexistente'}});
 expect(screen.getByText('Nenhum cargo encontrado')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Limpar busca'}));
 expect(screen.getByText('Acabador Júnior')).toBeTruthy();expect(screen.getByText('Engenheiro Sênior')).toBeTruthy();
});
