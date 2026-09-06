// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SeletorFotos from '../components/SeletorFotos';
import GaleriaMidias from '../components/GaleriaMidias';
const acervo=[{id:'a',url:'https://exemplo.com/a.webp',legenda:'Estrutura azul',tipo:'imagem'},{id:'b',url:'https://exemplo.com/b.webp',legenda:'Galpão',tipo:'imagem'},{id:'v',url:'https://exemplo.com/v.mp4',legenda:'Montagem',tipo:'video',versao:'corte',miniatura:'https://exemplo.com/v.jpg',duracao:8}];
beforeEach(()=>{globalThis.React=React;vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({daObra:[],outras:[],acervo})}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
describe('Banco de mídias',()=>{
 it('capa permite somente uma foto e não oferece vídeo',async()=>{
  const escolher=vi.fn();render(<SeletorFotos aberto multiplo={false} onFechar={()=>{}} onEscolher={escolher}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Selecionar Estrutura azul'}));
  fireEvent.click(screen.getByRole('button',{name:'Selecionar Galpão'}));
  expect(screen.queryByRole('button',{name:'Selecionar Montagem'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Usar seleção'}));
  await waitFor(()=>expect(escolher).toHaveBeenCalledWith([expect.objectContaining({url:acervo[1].url})]));
 });
 it('oferece cortes somente quando o destino permite vídeo',async()=>{
  const escolher=vi.fn();render(<SeletorFotos aberto permitirVideos onFechar={()=>{}} onEscolher={escolher}/>);
  await screen.findByRole('button',{name:'Selecionar Montagem'});
  fireEvent.click(screen.getByRole('button',{name:'Cortes para apresentação'}));
  expect(screen.queryByRole('button',{name:'Selecionar Galpão'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Selecionar Montagem'}));
  fireEvent.click(screen.getByRole('button',{name:'Usar seleção'}));
  await waitFor(()=>expect(escolher).toHaveBeenCalledWith([expect.objectContaining({tipo:'video',versao:'corte'})]));
 });
 it('erro de API não aparece como acervo vazio',async()=>{
  fetch.mockResolvedValue({ok:false,json:async()=>({error:'falha'})});render(<SeletorFotos aberto onFechar={()=>{}}/>);
  expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.getByRole('button',{name:'Tentar novamente'})).toBeTruthy();
 });
 it('galeria não carrega vídeo antes de selecioná-lo',()=>{
  const {container}=render(<GaleriaMidias itens={acervo}/>);expect(container.querySelector('video')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Mostrar Montagem'}));
  const video=container.querySelector('video');expect(video.getAttribute('preload')).toBe('none');expect(video.autoplay).toBe(false);
 });
});
