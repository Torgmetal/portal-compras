// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import Tela from '@/app/producao/qualidade/QualidadeProducaoClient';
vi.mock('@/components/FichaPecaModal',()=>({default:()=>null}));
beforeEach(()=>{globalThis.React=React;});afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('não consulta antes de escolher OP e permite recuperar falha',async()=>{
 const fetch=vi.fn().mockRejectedValueOnce(new Error('Falha de conexão')).mockResolvedValue({ok:true,json:async()=>({total:0,paginas:1,relatorios:[]})});vi.stubGlobal('fetch',fetch);
 render(<Tela ops={[{id:'op112',numero:'112'}]}/>);expect(fetch).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Ordem de produção'),{target:{value:'op112'}});
 fireEvent.click(await screen.findByRole('button',{name:'Tentar novamente'}));
 expect(await screen.findByText('Nenhum relatório encontrado para esta seleção.')).toBeTruthy();
});
