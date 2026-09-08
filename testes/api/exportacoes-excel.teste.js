import {beforeEach,describe,it,expect,vi} from 'vitest';
import ExcelJS from 'exceljs';
import {writeFile,mkdir} from 'node:fs/promises';
import {mockPrisma} from '@/testes/apoio/prisma';
const mocks=vi.hoisted(()=>({role:vi.fn()}));
vi.mock('@/lib/session',()=>({requireRole:mocks.role}));
vi.mock('@/lib/prisma',()=>({prisma:mockPrisma,prismaDirect:mockPrisma}));
import {GET as materiais} from '@/app/api/comercial/template-materiais/route';
import {GET as acessorios} from '@/app/api/comercial/template-acessorios/route';
import {GET as folha} from '@/app/api/rh/folha/[id]/export/route';
import {GET as ponto} from '@/app/api/rh/ponto/[id]/export/route';
import {GET as fluxo} from '@/app/api/financeiro/fluxo/exportar/route';
import {GET as cargos} from '@/app/api/rh/cargos/template/route';
import {GET as setores} from '@/app/api/rh/setores/template/route';
import {GET as funcionarios} from '@/app/api/rh/funcionarios/template/route';
import {GET as documentos} from '@/app/api/rh/documentos/template/route';
import {calcDerivados} from '@/lib/folha-calc';
import {parseLevantamentoEstrutura,isLevantamentoEstrutura} from '@/lib/parse-levantamento-estrutura';
import {parseComposicaoAreas,isComposicaoAreas} from '@/lib/parse-composicao-areas';

beforeEach(()=>{vi.resetAllMocks();});
async function abrir(response,nome){
 expect(response.status).toBe(200);
 expect(response.headers.get('content-type')).toMatch(/spreadsheetml/);
 const buf=Buffer.from(await response.arrayBuffer());
 if(process.env.EXCEL_QA_DIR){await mkdir(process.env.EXCEL_QA_DIR,{recursive:true});await writeFile(`${process.env.EXCEL_QA_DIR}/${nome}.xlsx`,buf);}
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(buf);return wb;
}
function linhaCom(ws,texto,col=1){let found;ws.eachRow(row=>{if(row.getCell(col).value===texto)found=row;});expect(found).toBeTruthy();return found;}
const req=query=>new Request('http://localhost/api/financeiro/fluxo/exportar'+query);

describe('modelos comerciais reais',()=>{
 it.each([['materiais',materiais],['acessorios',acessorios]])('%s preserva cálculos, proteção e listas completas',async(nome,get)=>{
  const wb=await abrir(await get(),nome),ws=wb.worksheets[0];
  expect(ws.getCell('A1').value).toContain('TORG');expect(ws.sheetProtection.sheet).toBe(true);
  expect(wb.getWorksheet('Banco de Dados').sheetProtection.sheet).toBe(true);
  const opcoes=wb.getWorksheet('Opções Torg');expect(opcoes.state).toBe('veryHidden');
  let formulas=0,inputs=0,validacoes=0;
  ws.eachRow(row=>row.eachCell({includeEmpty:true},c=>{
   if(c.type===6){formulas++;expect(c.formula).not.toContain('#REF!');expect(c.protection?.locked).not.toBe(false);}
   if(c.protection?.locked===false&&c.type!==6){inputs++;expect(c.fill.fgColor.argb).toBe('FFF5DB');}
   if(c.dataValidation?.type==='list'){
    validacoes++;const nomeLista=c.dataValidation.formulae[0];expect(nomeLista).toMatch(/^TORG_/);
    expect(wb.definedNames.getRanges(nomeLista).ranges.length).toBe(1);
   }
  }));
  expect(formulas).toBeGreaterThan(30);expect(inputs).toBeGreaterThan(30);expect(validacoes).toBeGreaterThan(20);
  if(nome==='materiais'){
   let calculo;ws.eachRow(r=>{if(r.getCell(7).formula?.includes('*F'))calculo=r;});
   const n=calculo.number;expect(calculo.getCell(7).formula).toBe(`IF(OR(E${n}="",F${n}=""),0,E${n}*F${n})`);
   expect(calculo.getCell(9).formula).toBe(`IF(OR(G${n}=0,H${n}=""),0,G${n}*H${n})`);
  }
 },15000);
 it('exige autorização antes de gerar um modelo',async()=>{mocks.role.mockRejectedValue(new Error('Unauthorized'));expect((await materiais()).status).toBe(401);expect((await acessorios()).status).toBe(401);});
 it('material preenchido volta pelo importador com os mesmos campos',async()=>{
  const wb=await abrir(await materiais(),'materiais'),ws=wb.worksheets[0];
  ws.getCell('B11').value='ASTM A36';ws.getCell('C11').value='Viga W';ws.getCell('D11').value='W 200 x 15';ws.getCell('E11').value=3;ws.getCell('F11').value=6;
  const buf=await wb.xlsx.writeBuffer();expect(isLevantamentoEstrutura(buf)).toBe(true);
  const r=parseLevantamentoEstrutura(buf);expect(r.erros).toEqual([]);expect(r.itens).toHaveLength(1);expect(r.itens[0]).toMatchObject({descricao:'W 200 x 15',norma:'ASTM A36',quantidade:3,comprimento:6});
 });
 it('acessório preenchido volta pelo importador sem incluir a aba técnica de opções',async()=>{
  const wb=await abrir(await acessorios(),'acessorios'),ws=wb.worksheets[0];
  ws.getCell('B12').value='Telha de teste, espessura 0,50';ws.getCell('C12').value=150;ws.getCell('F12').value=42.5;
  const buf=await wb.xlsx.writeBuffer();expect(isComposicaoAreas(buf)).toBe(true);
  const r=parseComposicaoAreas(buf);expect(r.erros).toEqual([]);expect(r.itens).toHaveLength(1);expect(r.itens[0]).toMatchObject({quantidade:150,custoUnitario:42.5});
 });
});

describe('relatórios financeiros e RH',()=>{
 it('fluxo mantém filtros, sinal dos movimentos, códigos de OP e saldo nas duas abas',async()=>{
  mockPrisma.fluxoCaixa.findMany.mockResolvedValue([
   {data:new Date('2026-09-07T12:00:00Z'),tipo:'ENTRADA',valor:1000.5,realizado:true,op:{numero:'00097'},descricao:'Cliente de teste'},
   {data:new Date('2026-09-07T12:00:00Z'),tipo:'SAIDA',valor:200.25,realizado:true,op:{numero:'00097'},descricao:'Fornecedor de teste'},
  ]);
  const wb=await abrir(await fluxo(req('?de=2026-09-01&ate=2026-09-30&banco=Banco+Teste&situacao=real')),'fluxo');
  expect(mockPrisma.fluxoCaixa.findMany.mock.calls[0][0].where).toMatchObject({contaCorrente:'Banco Teste',realizado:true});
  const ws=wb.worksheets[0],entrada=linhaCom(ws,'Entrada',2),saida=linhaCom(ws,'Saída',2);
  expect(entrada.getCell(8).value).toBe('00097');expect(entrada.getCell(1).value).toBeInstanceOf(Date);
  expect(entrada.getCell(9).value).toBe(1000.5);expect(saida.getCell(9).value).toBe(-200.25);
  expect(linhaCom(ws,'TOTAL').getCell(9).value).toBe(800.25);
  expect(linhaCom(wb.getWorksheet('Resumo'),'Saldo do período').getCell(2).value).toBe(800.25);
 });
 it('período invertido não consulta o banco',async()=>{expect((await fluxo(req('?de=2026-09-30&ate=2026-09-01'))).status).toBe(400);expect(mockPrisma.fluxoCaixa.findMany).not.toHaveBeenCalled();});
 it('folha conserva as 32 colunas, CPF e resultado calculado pelo RH',async()=>{
  const item={empresa:'Torg',nome:'Pessoa de teste',tipoContrato:'CLT',centroCusto:'Produção',cpf:'00123456789',salarioBase:2200,heHoras50:10,inss:100,irrf:20,adicionais:50};
  mockPrisma.folhaCompetencia.findUnique.mockResolvedValue({competencia:'2026-09',itens:[item]});
  const wb=await abrir(await folha(null,{params:{id:'teste'}}),'folha-rh');
  const r=linhaCom(wb.getWorksheet('Folha'),item.nome,4);
  expect(wb.getWorksheet('Folha').columnCount).toBe(32);expect(r.getCell(5).value).toBe(item.cpf);
  expect(r.getCell(28).value).toBe(calcDerivados(item).salarioFinal);expect(r.getCell(16).value).toBe(150);
  expect(linhaCom(wb.getWorksheet('Resumo'),'TOTAL').getCell(11).value).toBe(r.getCell(28).value);
 });
 it('ponto conserva PIS, horas decimais e observação completa',async()=>{
  mockPrisma.pontoCompetencia.findUnique.mockResolvedValue({competencia:'2026-09',itens:[{pisArquivo:'00012345678',nome:'Pessoa de teste',marcacoes:[{},{}],horasExtras50:2.75,observacao:'Observação de teste '.repeat(15)}]});
  const wb=await abrir(await ponto(null,{params:{id:'teste'}}),'ponto-rh');
  const r=linhaCom(wb.worksheets[0],'00012345678');expect(r.getCell(4).value).toBe(2);expect(r.getCell(5).value).toBe(2.75);expect(r.height).toBeGreaterThan(50);
 });
 it.each([['cargos',cargos,'Nome'],['setores',setores,'Nome'],['funcionarios',funcionarios,'Nome'],['documentos',documentos,'Nome']])('modelo RH %s mantém a primeira linha de importação',async(nome,get,primeiro)=>{
  mockPrisma.setor.findMany.mockResolvedValue([{nome:'Produção'}]);mockPrisma.cargo.findMany.mockResolvedValue([{nome:'Soldador'}]);
  mockPrisma.funcionario.findMany.mockResolvedValue([{nome:'Pessoa de teste',matricula:'001',setor:{nome:'Produção'}}]);
  const wb=await abrir(await get(),`modelo-${nome}`);expect(wb.worksheets[0].getCell('A1').value).toContain(primeiro);
  expect(wb.worksheets[0].getCell('A2').value).toBeTruthy();expect(wb.worksheets[0].views[0].showGridLines).toBe(false);
 });
 it('mantém permissões de exportação no financeiro e RH',async()=>{
  mocks.role.mockRejectedValue(new Error('Forbidden'));
  expect((await fluxo(req(''))).status).toBe(403);expect((await folha(null,{params:{id:'teste'}})).status).toBe(403);
  expect(mockPrisma.fluxoCaixa.findMany).not.toHaveBeenCalled();expect(mockPrisma.folhaCompetencia.findUnique).not.toHaveBeenCalled();
 });
});
