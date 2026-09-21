// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import FichaPecaModal from '@/components/FichaPecaModal';
beforeEach(()=>{globalThis.React=React;});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const dados={marca:'T112A1',op:{numero:'112'},pecas:[{id:'p1',qte:2,perfil:'W200',opNumero:'112A'},{id:'p2',qte:3,perfil:'W300',opNumero:'112B'}],fabrica:{trilha:[]}};
it('mostra todos os registros da marca e permite fechar pelo teclado',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>dados})));
 const fechar=vi.fn();render(<FichaPecaModal opId="op112" marca="T112A1" onClose={fechar}/>);
 expect(await screen.findByText('W200')).toBeTruthy();expect(screen.getByText('W300')).toBeTruthy();
 fireEvent.keyDown(document,{key:'Escape'});expect(fechar).toHaveBeenCalled();
});
it('permite tentar novamente quando a consulta falha',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new Error('Falha de conexão')).mockResolvedValue({ok:true,json:async()=>dados}));
 render(<FichaPecaModal opId="op112" marca="T112A1" onClose={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Tentar novamente'}));
 expect(await screen.findByText('W200')).toBeTruthy();
});
it('ignora uma resposta antiga quando a marca muda',async()=>{
 let resolver;
 vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolver=r;})).mockResolvedValue({ok:true,json:async()=>({...dados,marca:'T112A2',pecas:[{id:'b',perfil:'W400'}]})}));
 const v=render(<FichaPecaModal opId="op112" marca="T112A1" onClose={()=>{}}/>);
 v.rerender(<FichaPecaModal opId="op112" marca="T112A2" onClose={()=>{}}/>);
 expect(await screen.findByText('W400')).toBeTruthy();
 await import('@testing-library/react').then(({act})=>act(async()=>{resolver({ok:true,json:async()=>dados});}));
 expect(screen.queryByText('W200')).toBeNull();expect(screen.getByText('W400')).toBeTruthy();
});
