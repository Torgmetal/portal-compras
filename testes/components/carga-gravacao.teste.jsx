// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,act,cleanup} from '@testing-library/react';
import Modal from '@/components/carga/SimularCargaModal';
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('@/lib/carga/geometria-ifc',()=>({geometriaDoIfc:async()=>({geometria:{A:{}},malhas:{},faltantes:[]})}));
vi.mock('@/lib/store',()=>({useStore:()=>({showToast:vi.fn()})}));
vi.mock('@/components/carga/ResultadoSimulacao',()=>({ResumoSimulacao:()=>null,VolumesDaCarga:()=>null,AvisosSimulacao:()=>null}));
vi.mock('@/components/carga/AjustesCarga',()=>({EditorAjuste:()=>null,ListaAjustes:()=>null}));
let workers,liberar;
beforeEach(()=>{
 globalThis.React=React;workers=[];
 vi.stubGlobal('Worker',class{constructor(){workers.push(this);}postMessage(){}terminate(){}});
 vi.stubGlobal('fetch',vi.fn(async(url,op={})=>{
  if(op.method==='POST')return new Promise(resolve=>{liberar=()=>resolve({json:async()=>({success:true,simulacao:{id:'salva',createdAt:new Date().toISOString()}})});});
  return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0),json:async()=>url.includes('ajustes-carga')?{success:true,ajustes:{}}:url.includes('modelo-3d')?{modelos:[{nome:'Modelo',rel:'a'}]}:{success:true,podeEditar:true,op:{numero:'107'},previo:{pesoKg:10},lista:[{marca:'A',qtd:1,desc:'VIGA',kgUn:10}],perfis:[],opcoes:{},hash:'h'}};
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('aguarda a gravação antes de liberar nova simulação ou fechamento',async()=>{
 const fechar=vi.fn();render(<Modal opId="op" opNumero="107" previo={{id:'p'}} onClose={fechar}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Simular',exact:true}).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Simular',exact:true}));
 await act(async()=>{workers[0].onmessage({data:{ok:true,resultado:{cargas:[],resumo:{},estimadas:[]}}});});
 expect(screen.getByRole('button',{name:'Simular de novo',exact:true}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Fechar simulação'}));expect(fechar).not.toHaveBeenCalled();
 await act(async()=>liberar());
 expect(screen.getByRole('button',{name:'Simular de novo',exact:true}).disabled).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Simular de novo',exact:true}));expect(workers).toHaveLength(2);
});
