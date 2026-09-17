// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
vi.mock('@/lib/store',()=>({useStore:()=>({showToast:vi.fn()})}));
vi.mock('@/app/comercial/[id]/AceitePlano',()=>({default:()=> <div>Responsáveis do PIT</div>}));
import PitCompacto from '@/components/comercial/PitCompacto';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('remove o PIT Torg após confirmação e mantém o anexo do cliente',async()=>{
 const f=vi.fn(async(url,opcoes)=>({ok:true,json:async()=>opcoes?.method==='PUT'?{ok:true}:url.endsWith('/cliente')?{documentos:[{id:'d1',nome:'PIT recebido',arquivoNome:'pit.pdf'}]}:{podeGerenciar:true,padrao:'TORG',revisao:'0',opcoes:[{id:'TORG',nome:'PIT Torg'}]}}));
 vi.stubGlobal('fetch',f);render(<PitCompacto opNumero="122"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Excluir PIT Torg'}));
 expect(f.mock.calls.some(([,o])=>o?.method==='PUT')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Excluir PIT'}));
 await screen.findByText('Criar PIT Torg');
 expect(screen.getByText('PIT recebido')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Excluir PIT Torg'})).toBeNull();
 expect(f).toHaveBeenCalledWith('/api/qualidade/pit/122',expect.objectContaining({method:'PUT',body:JSON.stringify({padrao:null,revisao:''})}));
});
function montar(podeGerenciar,padrao=null){vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>url.endsWith('/cliente')?{documentos:[]}:{podeGerenciar,padrao,revisao:'0',opcoes:[{id:'TORG',nome:'PIT Torg',resumo:'Estrutura pintada'}]}})));render(<PitCompacto opNumero="122"/>);}
it('abre seletor apenas por ação, sem cartões nem responsáveis permanentes',async()=>{montar(true);await screen.findByText('Criar PIT Torg');expect(screen.queryByRole('combobox')).toBeNull();expect(screen.queryByText('Responsáveis do PIT')).toBeNull();fireEvent.click(screen.getByText('Criar PIT Torg'));expect(screen.getByRole('combobox',{name:'Modelo de PIT'})).toBeTruthy();});
it('setor de consulta não recebe botões de gestão',async()=>{montar(false,'TORG');await screen.findByText('Visualizar');expect(screen.queryByText('Anexar PIT do cliente')).toBeNull();expect(screen.queryByText('Editar PIT Torg')).toBeNull();});
it('abre responsáveis só durante edição do PIT existente',async()=>{montar(true,'TORG');await screen.findByText('Editar PIT Torg');expect(screen.queryByText('Responsáveis do PIT')).toBeNull();fireEvent.click(screen.getByText('Editar PIT Torg'));expect(screen.getByText('Responsáveis do PIT')).toBeTruthy();});
it('exige confirmação para excluir e remove a linha somente após sucesso',async()=>{const fetchMock=vi.fn(async(url,opcoes)=>({ok:true,json:async()=>opcoes?.method==='DELETE'?{ok:true}:url.endsWith('/cliente')?{documentos:[{id:'d1',nome:'PIT recebido',arquivoNome:'pit.pdf'}]}:{podeGerenciar:true,padrao:null,revisao:'0',opcoes:[]}}));vi.stubGlobal('fetch',fetchMock);render(<PitCompacto opNumero="122"/>);await screen.findByText('PIT recebido');fireEvent.click(screen.getByRole('button',{name:'Excluir',exact:true}));expect(fetchMock.mock.calls.some(([,o])=>o?.method==='DELETE')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Excluir anexo'}));await screen.findByText('Nenhum PIT disponibilizado para esta obra.');expect(fetchMock).toHaveBeenCalledWith('/api/qualidade/pit/122/cliente',expect.objectContaining({method:'DELETE',body:JSON.stringify({id:'d1'})}));});
