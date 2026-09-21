// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ToggleSidebar from '../components/ToggleSidebar';
vi.mock('next/navigation', () => ({ usePathname: () => '/engenharia' }));
beforeEach(() => {
  globalThis.React = React;
  const dados = new Map();
  vi.stubGlobal('localStorage', { getItem: key => dados.get(key) ?? null, setItem: (key, value) => dados.set(key, String(value)) });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); document.documentElement.className=''; document.body.style.overflow=''; vi.unstubAllGlobals(); });
function montar() { return render(<aside><ToggleSidebar moduloAtual="Engenharia"/><a href="#teste">OPs</a></aside>); }
it('abre mesmo com preferência desktop recolhida e restaura rolagem ao fechar', () => {
  localStorage.setItem('menuOculto','1');
  const { container }=montar();
  expect(container.querySelector('aside').inert).toBe(true);
  fireEvent.click(screen.getByLabelText('Abrir menu'));
  expect(container.querySelector('aside').inert).toBe(false);
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.click(screen.getByLabelText('Fechar menu'));
  expect(container.querySelector('aside').inert).toBe(true);
  expect(document.body.style.overflow).toBe('');
  expect(localStorage.getItem('menuOculto')).toBe('1');
  expect(document.activeElement).toBe(screen.getByLabelText('Abrir menu'));
});
it('fecha com Escape e ao selecionar um link', () => {
  montar();
  fireEvent.click(screen.getByLabelText('Abrir menu'));
  fireEvent.keyDown(document,{key:'Escape'});
  expect(document.documentElement.classList.contains('menu-mobile-aberto')).toBe(false);
  fireEvent.click(screen.getByLabelText('Abrir menu'));
  fireEvent.click(screen.getByText('OPs'));
  expect(document.documentElement.classList.contains('menu-mobile-aberto')).toBe(false);
});
it('limpa a classe e o bloqueio de rolagem ao sair do módulo', () => {
  const {unmount}=montar();
  fireEvent.click(screen.getByLabelText('Abrir menu'));
  unmount();
  expect(document.body.style.overflow).toBe('');
  expect(document.documentElement.classList.contains('menu-mobile-aberto')).toBe(false);
});
