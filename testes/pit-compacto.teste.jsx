// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
vi.mock('@/lib/store',()=>({useStore:()=>({showToast:vi.fn()})}));
vi.mock('@/app/comercial/[id]/AceitePlano',()=>({default:()=> <div>Responsáveis do PIT</div>}));
import PitCompacto from '@/components/comercial/PitCompacto';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function montar(podeGerenciar,padrao=null){vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>url.endsWith('/cliente')?{documentos:[]}:{podeGerenciar,padrao,revisao:'0',opcoes:[{id:'TORG',nome:'PIT Torg',resumo:'Estrutura pintada'}]}})));render(<PitCompacto opNumero="122"/>);}
it('abre seletor apenas por ação, sem cartões nem responsáveis permanentes',async()=>{montar(true);await screen.findByText('Criar PIT Torg');expect(screen.queryByRole('combobox')).toBeNull();expect(screen.queryByText('Responsáveis do PIT')).toBeNull();fireEvent.click(screen.getByText('Criar PIT Torg'));expect(screen.getByRole('combobox',{name:'Modelo de PIT'})).toBeTruthy();});
it('setor de consulta não recebe botões de gestão',async()=>{montar(false,'TORG');await screen.findByText('Visualizar');expect(screen.queryByText('Anexar PIT do cliente')).toBeNull();expect(screen.queryByText('Editar PIT Torg')).toBeNull();});
it('abre responsáveis só durante edição do PIT existente',async()=>{montar(true,'TORG');await screen.findByText('Editar PIT Torg');expect(screen.queryByText('Responsáveis do PIT')).toBeNull();fireEvent.click(screen.getByText('Editar PIT Torg'));expect(screen.getByText('Responsáveis do PIT')).toBeTruthy();});
