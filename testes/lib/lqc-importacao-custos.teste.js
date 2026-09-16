import { expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { importarLqc } from '@/lib/lqc-importar';
import { calcularLqc } from '@/lib/lqc';
function arquivo() {
  const wb = XLSX.utils.book_new();
  const aba = (nome, linhas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  aba('RESUMOS_EM', [
    ['Item','Área','Classificação','Peso Total','% Perda de tintas'],
    ['1.1','Área A','LEVE',1000,0.45],
  ]);
  aba('INDUSTRIALIZAÇÃO', [
    ['Item','Descrição','Especificação','Unid.','Peso Total','Preço Unit.','Subtotal'],
    ['1.1','MATÉRIA PRIMA','FATURAMENTO:','TORG',1000,8,8000],
    ['', 'Área A','', 'kg',1000,8,8000],
    ['1.3','TINTAS','FATURAMENTO:','TORG',1000,1.6676392946,1667.6392946],
    ['', 'ESTRUTURA — FATOR DE PERDA: 45%',0.45,'kg',1000,1.6676392946,1667.6392946],
    ['2','MÃO DE OBRA TERCEIRIZADA','','',1000,0.47,470],
    ['2.1','CÁLCULO ESTRUTURAL','FATURAMENTO:','TORG',1000,0.05,50],
    ['', 'Cálculo estrutural, memorial e ART','', 'kg',1000,0.05,50],
    ['2.3','QUALIDADE','FATURAMENTO:','TORG',1000,0.42,420],
    ['', 'Inspeções e testes','', 'kg',1000,0.25,250],
    ['', 'Inspetor N1','', 'kg',1000,0.17,170],
    ['3.1','FABRICAÇÃO','FATURAMENTO:','TORG'],
    ['', 'Leve','', 'kg',1000,3.6667,3666.7],
    ['3.2','PINTURA','FATURAMENTO:','TORG'],
    ['', 'Leve','Nº DEMÃOS - 2', 'kg',1000,1.375,1375],
    ['3.3','PRÉ-MONTAGEM','FATURAMENTO:','N/A'],
    ['', 'Leve','N/A', 'kg',1000,0,0],
  ]);
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
it('traz serviços detalhados sem duplicar os subtotais e preserva precisão por classe', () => {
  const lido = importarLqc(arquivo());
  expect(lido.ok).toBe(true);
  expect(lido.custosImportados.terceiros).toHaveLength(3);
  expect(lido.custosImportados.precos.classe.LEVE).toEqual({fabricacao:3.6667,pintura:1.375,preMont:0});
  const r = calcularLqc({...lido.custosImportados, resumos:lido.resumos.map(r=>({...r,precoKg:8})),tintas:lido.tintas});
  expect(r.grupos.terceirizados.total.subtotal).toBe(470);
  expect(r.grupos.tintas.total.subtotal).toBe(1667.64);
  expect(r.grupos.fabricacao.total.subtotal).toBe(3666.7);
  expect(r.grupos.pintura.total.subtotal).toBe(1375);
});
it('o custo histórico de tintas acompanha a retirada de áreas do escopo', () => {
  const lido = importarLqc(arquivo());
  const r = calcularLqc({...lido.custosImportados,tintas:lido.tintas,resumos:lido.resumos.map(r=>({...r,ativo:false}))});
  expect(r.grupos.tintas.total.subtotal).toBe(0);
  expect(r.grupos.terceirizados.total.subtotal).toBe(0);
});
it('serviço com peso menor e área desconhecida preserva o subtotal sem cobrar o peso inteiro da obra', () => {
  const wb=XLSX.read(arquivo(),{type:'buffer'});
  wb.Sheets['INDUSTRIALIZAÇÃO'].E8={t:'n',v:200};
  wb.Sheets['INDUSTRIALIZAÇÃO'].G8={t:'n',v:10};
  const l=importarLqc(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
  const r=calcularLqc({...l.custosImportados,resumos:l.resumos,tintas:l.tintas});
  expect(r.grupos.terceirizados.total.subtotal).toBe(430);
  expect(l.avisos.some(a=>a.includes('escopo'))).toBe(true);
});
it('o detalhamento por área usa os preços de fabricação e pintura importados, sem ratear a diferença de tabela',()=>{
 const r=calcularLqc({resumos:[{area:'A',pesoTotal:100,classificacao:'LEVE'},{area:'B',pesoTotal:100,classificacao:'MÉDIO'}],precos:{classe:{LEVE:{fabricacao:1,pintura:.5},MEDIO:{fabricacao:2,pintura:.2}}}});
 expect(r.porArea.find(a=>a.area==='A').industrializacao).toBe(150);
 expect(r.porArea.find(a=>a.area==='B').industrializacao).toBe(220);
});
it('prioriza nome exato de área e usa verba reconhecida pela tela para base não identificada',()=>{
 const wb=XLSX.read(arquivo(),{type:'buffer'});
 wb.Sheets.RESUMOS_EM=XLSX.utils.aoa_to_sheet([['Item','Área','Classificação','Peso Total','% Perda de tintas'],['1.1','Área A','LEVE',100,.45],['1.2','Área AB','LEVE',100,.45]]);
 wb.Sheets['INDUSTRIALIZAÇÃO'].B8={t:'s',v:'Área AB'};
 wb.Sheets['INDUSTRIALIZAÇÃO'].E8={t:'n',v:100};
 wb.Sheets['INDUSTRIALIZAÇÃO'].G8={t:'n',v:5};
 const l=importarLqc(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
 expect(l.custosImportados.terceiros[0].area).toBe('Área AB');
 expect(l.custosImportados.terceiros[1].base).toBe('verba');
});
