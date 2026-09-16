import { describe, expect, it } from 'vitest';
import { ordenarPropostasConsulta, prepararConsultaProposta } from '@/lib/proposta-obra-consulta';
describe('seleção da proposta da obra',()=>{
 it('prioriza técnica, maior revisão e ignora modelos em branco',()=>{
  const lista=ordenarPropostasConsulta([{id:'c',nome:'PC-081-R06.docx'},{id:'t1',nome:'PT-081-R02.pdf'},{id:'modelo',nome:'PTC-000-26-CLIENTE-OBRA-R99.docx'},{id:'t4',nome:'PT-081-R04.docx'}]);
  expect(lista.map(p=>p.id)).toEqual(['t4','t1','c']);
 });
 it('comercial é alternativa quando não existe técnica',()=>expect(ordenarPropostasConsulta([{id:'c',nome:'PC-081-R06.pdf'}])[0].tipo).toBe('COMERCIAL'));
});
describe('conteúdo para consulta',()=>{
 it('remove tabela financeira inteira e mantém escopo/inclusões/exclusões',()=>{
  const p=prepararConsultaProposta('PROPOSTA COMERCIAL\n\nEscopo\n\nFabricação de estruturas.\n\nPlanilha de quantidade e preço\n\nPeça A\n\n19,66\n\n10.273.836,55\n\nInclusos\n\nParafusos de pré-montagem.\n\nExclusos\n\nMontagem em campo.');
  expect(p.secoes.map(s=>s.titulo)).toEqual(['Escopo','Inclusos','Exclusos']);
  expect(JSON.stringify(p)).not.toMatch(/19,66|10.273.836|Peça A/);
 });
 it('omite parágrafos financeiros em seção técnica sem truncar números técnicos',()=>{
  const p=prepararConsultaProposta('PROPOSTA TÉCNICA\n\nTratamento de superfície\n\nEPS total: 240μm.\n\nPreço de R$ 123.000,00 para pintura.\n\nControle de qualidade\n\nUS em 100% das soldas.');
  expect(JSON.stringify(p)).toContain('240μm');expect(JSON.stringify(p)).toContain('100%');expect(JSON.stringify(p)).not.toContain('123.000');expect(p.omissoes).toBe(true);
 });
 it('não publica texto de estrutura desconhecida',()=>expect(prepararConsultaProposta('Preço especial\n\n123456\n\ntexto sem seção reconhecida').secoes).toEqual([]));
 it('não transforma texto do arquivo em HTML executável',()=>{
  expect(prepararConsultaProposta('Escopo\n\n<script>alert(1)</script>').secoes[0].paragrafos[0]).toBe('<script>alert(1)</script>');
 });
});
it('não deixa valores e parcelas em títulos comerciais alternativos',()=>{
 expect(JSON.stringify(prepararConsultaProposta('Escopo\nEstruturas metálicas.\nInvestimento\nEstrutura: 125.000,00\nEntrada de 30% na assinatura.'))).not.toContain('125.000');
});
