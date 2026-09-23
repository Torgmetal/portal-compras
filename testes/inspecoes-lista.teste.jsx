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
it('relatório aprovado esperando assinatura diz QUEM falta e PARA QUAL E-MAIL o convite foi',async()=>{
 // RIP-103-002 na produção (23/09/2026): Geraldo e Davi assinaram; o inspetor foi convidado num
 // e-mail que não é o login dele — e a tela mostrava só "Alexandre Stival · Inspetor"
 const assinaturas=[
  {nome:'Geraldo Tank',setor:'Torg Metal',email:'qualidade@torg.com.br',assinadoEm:'2026-09-21T13:16:28Z'},
  {nome:'Alexandre Stival',setor:'Inspetor',email:'alexandre_stival@yahoo.com.br',assinadoEm:null},
 ];
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({soltas:[],relatorios:[rel('3',{codigo:'RIP-103-002',tipo:'PINTURA',resultadoInspecao:'APROVADO',envioAssinaturaId:'envio',emitidoEm:'2026-09-21T13:06:25Z',assinaturas})]})}));
 render(<InspecoesClient podeFechar={false}/>);
 await screen.findByRole('button',{name:/Aprovados/});
 fireEvent.click(screen.getByRole('button',{name:/Aprovados/}));
 expect(screen.getByText('Aguardando assinaturas')).toBeTruthy();
 expect(screen.getByText('Falta assinar: Alexandre Stival (alexandre_stival@yahoo.com.br)')).toBeTruthy();
});
