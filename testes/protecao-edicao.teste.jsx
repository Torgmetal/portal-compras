// @vitest-environment jsdom
import React from 'react';
import {render, screen, fireEvent, cleanup, waitFor} from '@testing-library/react';
import {it, expect, vi, afterEach} from 'vitest';
import Protecao from '../components/qualidade/ProtecaoEdicao';
const {push}=vi.hoisted(()=>({push:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function Tela({texto='',salvar=async()=>false,versao=0}){return <><Protecao conteudo={{texto}} versaoSalva={versao} salvar={salvar} salvando={false}/><a href="/outra">Voltar</a></>;}
it('só avisa após edição e permite continuar editando',()=>{const r=render(<Tela/>);r.rerender(<Tela texto="alterado"/>);fireEvent.click(screen.getByText('Voltar'));expect(screen.getByText('Salvar antes de sair?')).toBeTruthy();fireEvent.click(screen.getByText('Continuar editando'));expect(screen.queryByText('Salvar antes de sair?')).toBeNull();expect(push).not.toHaveBeenCalled();});
it('não navega em falha e navega após sucesso confirmado',async()=>{const salvar=vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);const r=render(<Tela salvar={salvar}/>);r.rerender(<Tela texto="alterado" salvar={salvar}/>);fireEvent.click(screen.getByText('Voltar'));fireEvent.click(screen.getByText('Salvar e sair'));await waitFor(()=>expect(salvar).toHaveBeenCalledTimes(1));expect(push).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Salvar e sair'));await waitFor(()=>expect(push).toHaveBeenCalledWith('/outra'));});
it('salvamento confirmado limpa aviso; descarte não salva',()=>{const salvar=vi.fn();const r=render(<Tela salvar={salvar}/>);r.rerender(<Tela texto="novo" versao={1} salvar={salvar}/>);expect(screen.queryByText('Você tem alterações não salvas.')).toBeNull();r.rerender(<Tela texto="mais" versao={1} salvar={salvar}/>);fireEvent.click(screen.getByText('Voltar'));fireEvent.click(screen.getByText('Sair sem salvar'));expect(push).toHaveBeenCalledWith('/outra');expect(salvar).not.toHaveBeenCalled();});
it('protege recarregamento somente enquanto há edição',()=>{const r=render(<Tela/>);r.rerender(<Tela texto="texto"/>);const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);expect(e.defaultPrevented).toBe(true);});
