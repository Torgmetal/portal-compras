// @vitest-environment jsdom
import React from 'react';
import {afterEach, expect, it, vi} from 'vitest';
import {render, screen, fireEvent, cleanup} from '@testing-library/react';
import InspecoesClient from '../app/qualidade/inspecoes/InspecoesClient';
vi.mock('next/link',()=>({default:({children,...props})=><a {...props}>{children}</a>}));
const rel=(id,extra={})=>({id,codigo:`RID-084-${id}`,opNumero:'084',tipo:'DIMENSIONAL',assinaturas:[],marcas:['T84A1'],fotos:0,inspetor:'Lais',...extra});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('busca por marca, mantém aprovados separados e limpa filtros',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({soltas:[],relatorios:[rel('1'),rel('2',{resultadoInspecao:'APROVADO',marcas:['T84A2']})]})}));
 render(<InspecoesClient podeFechar={false}/>);
 await screen.findByText('RID-084-1');
 expect(screen.queryByText('RID-084-2')).toBeNull();
 expect(screen.queryByText('Enviar p/ assinatura')).toBeNull();
 expect(screen.queryByLabelText('Excluir RID-084-1')).toBeNull();
 fireEvent.change(screen.getByPlaceholderText('Código, marca ou inspetor'),{target:{value:'inexistente'}});
 expect(screen.queryByText('RID-084-1')).toBeNull();
 fireEvent.click(screen.getByText('Limpar filtros'));
 expect(screen.getByText('RID-084-1')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/Aprovados/}));
 expect(screen.getByText('RID-084-2')).toBeTruthy();
 expect(screen.queryByText('RID-084-1')).toBeNull();
});
it('envio sem signatários não aparece como assinatura concluída',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({soltas:[],relatorios:[rel('1',{envioAssinaturaId:'envio'})]})}));
 render(<InspecoesClient/>);
 await screen.findByText('Aguardando assinaturas');
 expect(screen.queryByText('Assinaturas concluídas')).toBeNull();
});
