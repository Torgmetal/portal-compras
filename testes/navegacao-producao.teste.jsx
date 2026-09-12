// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import Sidebar from '@/components/SidebarProducao';
vi.mock('next/navigation',()=>({usePathname:()=>'/producao/modelo'}));
vi.mock('@/components/SidebarModuleSwitcher',()=>({default:()=>null}));
vi.mock('@/components/SidebarUserFooter',()=>({default:()=>null}));
beforeEach(()=>{globalThis.React=React;});afterEach(cleanup);
it('preserva o acesso 3D e torna o catálogo e as ordens visíveis',()=>{
 render(<Sidebar/>);
 expect(screen.getByRole('link',{name:'Obra em 3D'}).getAttribute('href')).toBe('/producao/modelo');
 expect(screen.getByRole('link',{name:'Obra em 3D'}).getAttribute('aria-current')).toBe('page');
 expect(screen.getByRole('link',{name:'Catálogo de peças'}).getAttribute('href')).toBe('/producao/pecas');
 expect(screen.getByRole('link',{name:'Ordens e peças'}).getAttribute('href')).toBe('/producao/ordens');
 fireEvent.change(screen.getByRole('textbox',{name:'Buscar na Produção'}),{target:{value:'programacao'}});
 expect(screen.getByRole('link',{name:'Programação semanal'})).toBeTruthy();
 expect(screen.queryByRole('link',{name:'Estoque'})).toBeNull();
 fireEvent.change(screen.getByRole('textbox',{name:'Buscar na Produção'}),{target:{value:'naoexiste'}});
 expect(screen.getByText('Nenhuma ferramenta encontrada.')).toBeTruthy();
});
