// @vitest-environment jsdom
import React, {useState} from 'react';
import {it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup} from '@testing-library/react';
import Pintura from '@/app/campo/Pintura';
import AvisoPadroesInspecao from '@/components/AvisoPadroesInspecao';
globalThis.React=React;
afterEach(cleanup);
it('mantém alternativas selecionáveis no celular e permite trocar limpeza e aplicação',()=>{
 function Tela(){const [cond,setCond]=useState({limpeza:'SA2.5',abrasivo:'Granalha',demaos:{1:{metodo:'Airless'}}});return <Pintura cond={cond} setCond={setCond}/>;}
 render(<Tela/>);
 const limpeza=screen.getByLabelText('Grau de limpeza obtido');expect(limpeza.value).toBe('SA2.5');expect(limpeza.options.length).toBe(7);
 fireEvent.change(limpeza,{target:{value:'SA3'}});expect(limpeza.value).toBe('SA3');
 const metodo=screen.getByLabelText('Método de aplicação');expect(metodo.value).toBe('Airless');fireEvent.change(metodo,{target:{value:'Rolo'}});expect(metodo.value).toBe('Rolo');
 expect(screen.getByLabelText('Abrasivo').value).toBe('Granalha');
});
it('avisa diferença entre seleção e PLP sem bloquear as opções',()=>{render(<AvisoPadroesInspecao tipo="PINTURA" resultados={{limpeza:'SA3',padroesInspecao:{plp:{limpeza:'SA2.5'}}}}/>);expect(screen.getByRole('status').textContent).toContain('Sa 3');expect(screen.getByRole('status').textContent).toContain('Sa 2½');});
