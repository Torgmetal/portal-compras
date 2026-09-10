// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,fireEvent,cleanup,waitFor,act} from '@testing-library/react';
import GanttProgramacao from '@/app/pcp/producao/GanttProgramacao';
globalThis.React=React;
vi.mock('@/lib/desenhos-zip-cliente',()=>({baixarZipLote:vi.fn()}));
vi.mock('@/lib/pintura-excel-cliente',()=>({baixarCadernoPintura:vi.fn()}));
vi.mock('@/lib/baixa-syneco-cliente',()=>({baixarPlanilhaBaixaSyneco:vi.fn()}));
vi.mock('@/lib/lista-posto-cliente',()=>({baixarListaDoPosto:vi.fn()}));
const dia='2026-09-09';
const lote={id:'l1',op:'097',setor:'SOLDA',recurso:'SOLDA 1',dia,pecas:1,kg:100,custo:0.2,feitas:0,itens:[{id:'p1',m:'P1',q:1,kg:100,c:0.2}]};
const dados=()=>({hoje:dia,lotes:[structuredClone(lote)]});
const resposta=j=>({ok:true,json:async()=>j});
const diferida=()=>{let resolver;const promessa=new Promise(r=>{resolver=r});return {promessa,resolver};};
const $=id=>document.querySelector('#gp-'+id);
async function mover(){
 const barra=document.querySelector('[data-setor="SOLDA"] .barra-op');
 fireEvent(barra,new MouseEvent('pointerdown',{bubbles:true,button:0}));
 fireEvent(window,new MouseEvent('pointerup',{bubbles:true,button:0}));
 fireEvent.click($('selTodos'));fireEvent.click($('distribuir'));
 fireEvent.click(document.querySelector('[data-b="SOLDA 1"]'));
 fireEvent.click(document.querySelector('[data-b="SOLDA 2"]'));
 fireEvent.click($('aplicar'));
 expect($('nAlt').textContent).toBe('1');
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('atualizar não descarta uma programação ainda não salva',async()=>{
 const fetch=vi.fn(async()=>resposta(dados()));vi.stubGlobal('fetch',fetch);vi.stubGlobal('confirm',vi.fn(()=>false));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelector('.barra-op')).toBeTruthy());await mover();
 fireEvent.click($('recarregar'));await act(async()=>{});
 expect($('nAlt').textContent).toBe('1');expect(fetch).toHaveBeenCalledTimes(1);
});
it('falha ao recarregar depois de salvar mantém o quadro e não permite reenviar a mesma gravação',async()=>{
 let gets=0;vi.stubGlobal('fetch',vi.fn(async(_url,opt)=>opt?.method==='POST'?resposta({total:1}):++gets===1?resposta(dados()):Promise.reject(Error('Sem conexão'))));vi.stubGlobal('confirm',vi.fn(()=>true));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelector('.barra-op')).toBeTruthy());await mover();fireEvent.click($('salvar'));
 await waitFor(()=>expect(gets).toBe(2));await act(async()=>{});
 expect(document.querySelector('.barra-op')).toBeTruthy();expect($('nAlt').textContent).toBe('0');
});
it('uma resposta antiga não substitui a programação carregada mais recentemente',async()=>{
 const antiga=diferida();let gets=0;
 vi.stubGlobal('fetch',vi.fn(async()=>++gets===1?resposta(dados()):gets===2?antiga.promessa:resposta({hoje:dia,lotes:[{...structuredClone(lote),recurso:'SOLDA 5'}]})));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelector('.barra-op')).toBeTruthy());
 fireEvent.click($('recarregar'));fireEvent.click($('recarregar'));
 await waitFor(()=>expect(document.querySelector('.barra-op').closest('[data-rec]').dataset.rec).toBe('SOLDA 5'));
 await act(async()=>antiga.resolver(resposta(dados())));
 expect(document.querySelector('.barra-op').closest('[data-rec]').dataset.rec).toBe('SOLDA 5');
});
it('desfazer solda preserva a programação da mesma peça nos outros setores',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>resposta({hoje:dia,lotes:[structuredClone(lote),{...structuredClone(lote),id:'l2',setor:'CORTE',recurso:'LASER_CHAPA'}]})));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelectorAll('.barra-op')).toHaveLength(2));
 await mover();fireEvent.click($('desfazer'));
 expect(document.querySelectorAll('.barra-op')).toHaveLength(2);
});
it('não envia dois salvamentos ao receber um segundo clique enquanto aguarda o primeiro',async()=>{
 const salvar=diferida();let posts=0;
 vi.stubGlobal('fetch',vi.fn(async(_url,opt)=>{if(opt?.method==='POST'){posts++;return salvar.promessa;}return resposta(dados());}));vi.stubGlobal('confirm',vi.fn(()=>true));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelector('.barra-op')).toBeTruthy());await mover();
 const b=$('salvar');fireEvent.click(b);b.disabled=false;fireEvent.click(b);
 expect(posts).toBe(1);
 await act(async()=>salvar.resolver(resposta({total:1})));
});
it('preserva a semana e o setor selecionado ao recarregar a programação',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>resposta(dados())));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelector('.barra-op')).toBeTruthy());
 fireEvent.click(document.querySelector('.barra [data-setor="CORTE"]'));fireEvent.click($('prox'));
 const periodo=$('periodo').textContent;
 fireEvent.click($('recarregar'));await act(async()=>{});
 expect($('periodo').textContent).toBe(periodo);expect(document.querySelector('.barra [data-setor="CORTE"]').classList.contains('on')).toBe(false);
});
it('ampliar e reduzir com Escape preserva as alterações pendentes',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>resposta(dados())));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelector('.barra-op')).toBeTruthy());await mover();
 fireEvent.click($('pFechar'));fireEvent.click($('cheio'));
 expect(document.querySelector('.gpcp').classList.contains('cheio')).toBe(true);
 expect($('nAlt').textContent).toBe('1');
 fireEvent.keyDown(window,{key:'Escape'});
 expect(document.querySelector('.gpcp').classList.contains('cheio')).toBe(false);
 expect($('nAlt').textContent).toBe('1');
 expect(document.querySelector('.barra-op').closest('[data-rec]').dataset.rec).toBe('SOLDA 2');
});
it('recarregar no modo ampliado mantém o controle de reduzir a tela',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>resposta(dados())));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelector('.barra-op')).toBeTruthy());
 fireEvent.click($('cheio'));fireEvent.click($('recarregar'));await act(async()=>{});
 expect(document.querySelector('.gpcp').classList.contains('cheio')).toBe(true);
 expect($('cheio').textContent).toBe('Reduzir Gantt');
 expect($('cheio').getAttribute('aria-pressed')).toBe('true');
});
it('envia quantidades por dia sem reduzir os dez destinos da OP115 a um destino por marca',async()=>{
 const op={...structuredClone(lote),op:'115',pecas:50,kg:6099,custo:9.4,itens:[{id:'a1',m:'T115A1',q:44,kg:5777,c:8.8},{id:'a2',m:'T115A2',q:6,kg:322,c:0.6}]};
 let enviado;
 vi.stubGlobal('confirm',vi.fn(()=>true));
 vi.stubGlobal('fetch',vi.fn(async(_url,opt)=>{
  if(opt?.method==='POST'){enviado=JSON.parse(opt.body);return resposta({total:50});}
  return resposta({hoje:dia,lotes:[structuredClone(op)]});
 }));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelector('.barra-op')).toBeTruthy());
 const barra=document.querySelector('.barra-op');
 fireEvent(barra,new MouseEvent('pointerdown',{bubbles:true,button:0}));
 fireEvent(window,new MouseEvent('pointerup',{bubbles:true,button:0}));
 fireEvent.click($('selTodos'));fireEvent.click($('distribuir'));
 fireEvent.change($('qDias'),{target:{value:'10'}});
 expect(document.querySelectorAll('.prev tbody tr')).toHaveLength(10);
 fireEvent.click($('aplicar'));fireEvent.click($('salvar'));
 await waitFor(()=>expect(enviado).toBeTruthy());
 expect(new Set(enviado.blocos.map(b=>b.dia)).size).toBe(10);
 const fracoes=enviado.blocos.flatMap(b=>b.fracoes);
 expect(fracoes.filter(f=>f.id==='a1').reduce((s,f)=>s+f.quantidade,0)).toBe(44);
 expect(fracoes.filter(f=>f.id==='a2').reduce((s,f)=>s+f.quantidade,0)).toBe(6);
});
it('desfaz apenas a parte movida da marca, preservando a outra bancada',async()=>{
 const parte=(id,recurso,inicioUnidade)=>({...structuredClone(lote),id,recurso,pecas:5,kg:500,custo:1,itens:[{id:'p1',m:'P1',q:5,qTotal:10,inicioUnidade,kg:500,c:1}]});
 vi.stubGlobal('fetch',vi.fn(async()=>resposta({hoje:dia,lotes:[parte('l1','SOLDA 1',0),parte('l2','SOLDA 2',5)]})));
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelectorAll('.barra-op')).toHaveLength(2));
 await mover();fireEvent.click($('desfazer'));
 expect(document.querySelectorAll('.barra-op')).toHaveLength(2);
 expect([...document.querySelectorAll('.barra-op')].map(b=>b.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('5 pç'),expect.stringContaining('5 pç')]));
});
it('avisa no diálogo de exclusão que apagar a marca afeta todos os seus dias e bancadas',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>resposta(dados())));
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.open=true;}});
 render(<GanttProgramacao/>);await waitFor(()=>expect(document.querySelector('.barra-op')).toBeTruthy());
 const barra=document.querySelector('.barra-op');
 fireEvent(barra,new MouseEvent('pointerdown',{bubbles:true,button:0}));
 fireEvent(window,new MouseEvent('pointerup',{bubbles:true,button:0}));
 fireEvent.click($('apagar'));
 expect(document.querySelector('dialog').textContent).toContain('todos os dias e bancadas');
 expect(document.querySelector('dialog h3').textContent).toContain('Apagar a programação');
 delete HTMLDialogElement.prototype.showModal;
});
