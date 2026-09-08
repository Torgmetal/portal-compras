import {describe,it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {writeFile,mkdir} from 'node:fs/promises';
import {criarRelatorioTorg,adicionarHeaderTabela,adicionarLinhaTabela,adicionarLinhaTotais,adicionarRodapeISO,bufferWorkbookTorg} from '@/lib/excel-relatorio';
import {listaValidacaoExcel,refinarWorkbookExcel} from '@/lib/excel-refinamento';
import {criarExcelTabular,refinarModeloImportacao} from '@/lib/excel-tabular';
import {padronizarPlanilha} from '@/lib/excel-padronizar';
import {gerarRomaneioForm22} from '@/lib/romaneio-form22';
import {parseRomaneio} from '@/lib/parse-romaneio';

async function reabrir(wb,nome){
 const buf=wb instanceof ExcelJS.Workbook?await bufferWorkbookTorg(wb):wb;
 if(process.env.EXCEL_QA_DIR&&nome){await mkdir(process.env.EXCEL_QA_DIR,{recursive:true});await writeFile(`${process.env.EXCEL_QA_DIR}/${nome}.xlsx`,Buffer.from(buf));}
 const copia=new ExcelJS.Workbook();await copia.xlsx.load(buf);return copia;
}
function externo(abas){const wb=XLSX.utils.book_new();for(const [nome,linhas] of Object.entries(abas))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(linhas),nome);return wb;}
const bytes=wb=>XLSX.write(wb,{type:'buffer',bookType:'xlsx'});

describe('apresentação dos relatórios Excel',()=>{
 it.each([1,2,4,6,13,32])('cabeçalho, rodapé e impressão respeitam %i colunas',async(n)=>{
  const {workbook,sheet,linhaInicio}=await criarRelatorioTorg({titulo:'Relatório de acompanhamento da produção',totalColunas:n,nomePlanilha:'Relatório'});
  sheet.columns=Array.from({length:n},()=>({width:24}));
  adicionarHeaderTabela(sheet,linhaInicio,Array.from({length:n},(_,i)=>`Coluna ${i+1}`));
  adicionarLinhaTabela(sheet,linhaInicio+1,Array.from({length:n},(_,i)=>i+1));
  adicionarRodapeISO(sheet,linhaInicio+3,n);
  const r=(await reabrir(workbook,`cabecalho-${n}`)).worksheets[0];
  expect(r.columnCount).toBe(n);expect(r.getCell(linhaInicio+1,n).value).toBe(n);
  expect(r.views[0].showGridLines).toBe(false);expect(r.pageSetup.fitToHeight).toBe(0);
  expect(r.getImages().length).toBe(1);
 });
 it('título longo ocupa toda a largura e mantém código, revisão e formulário sem deslocar dados',async()=>{
  const titulo='Resumo de Compras — Faturamento Direto por fornecedor';
  const {workbook,sheet,linhaInicio}=await criarRelatorioTorg({titulo,totalColunas:6,codigoDoc:'REL-CMP-002',revisao:'03',form:21});
  sheet.columns=[16,52,12,7,16,18].map(width=>({width}));
  adicionarHeaderTabela(sheet,linhaInicio,['Código','Descrição','Qtd','Un','Preço','Total']);
  adicionarLinhaTabela(sheet,linhaInicio+1,['00001','Perfil',2,'un',12.5,25]);
  const r=(await reabrir(workbook)).worksheets[0];
  expect(r.getCell('F2').master.address).toBe('A2');
  expect(r.getCell('A2').value).toBe(titulo);
  expect(r.getCell('A3').value).toMatch(/REL-CMP-002.*Revisão 03.*FORM 21/);
  expect(r.getCell(linhaInicio+1,1).value).toBe('00001');
  expect(r.getCell(linhaInicio+1,6).value).toBe(25);
  expect(r.pageSetup.printTitlesRow).toBe(`1:${linhaInicio}`);
 });
 it('impressão larga usa A3 sem alterar largura de colunas ou a escolha de um formulário',async()=>{
  const {workbook,sheet,linhaInicio}=await criarRelatorioTorg({titulo:'Controle de produção',totalColunas:16});
  sheet.columns=Array.from({length:16},()=>({width:18}));
  adicionarHeaderTabela(sheet,linhaInicio,Array.from({length:16},(_,i)=>`Setor ${i}`));
  adicionarLinhaTabela(sheet,linhaInicio+1,Array.from({length:16},()=>10));
  const r=(await reabrir(workbook)).worksheets[0];
  expect(r.pageSetup.paperSize).toBe(8);expect(r.pageSetup.orientation).toBe('landscape');
  expect(r.getColumn(1).width).toBe(18);
  sheet._torgPreservarValores=true;sheet.pageSetup.paperSize=9;
  expect((await reabrir(workbook)).worksheets[0].pageSetup.paperSize).toBe(9);
 });
 it('mantém códigos e fórmulas, converte datas/percentuais explícitos e mostra descrições completas',async()=>{
  const wb=await criarExcelTabular({titulo:'Controle da produção',abas:[{nome:'Produção',headers:['Marca','Descrição','Execução','Data prevista','Peso (kg)','Calculado'],linhas:[['00097','Chapa de ligação com furos oblongos e acabamento especial '.repeat(4),'12,5%','07/09/2026',1250.7,{formula:'E6*2',result:2501.4}]],larguras:[16,35,16,18,18,18],totais:['TOTAL','','','',1250.7,'']}]});
  const t=wb.worksheets[0]._torgTabelas[0],row=t.headerRow+1;
  wb.worksheets[0].getCell(row,1).dataValidation={type:'list',formulae:['"00097,00098"']};
  const r=(await reabrir(wb,'producao-refinada')).worksheets[0];
  expect(r.getCell(row,1).value).toBe('00097');expect(r.getCell(row,1).dataValidation.type).toBe('list');
  expect(r.getCell(row,3).value).toBe(.125);expect(r.getCell(row,3).numFmt).toBe('0.0%');
  expect(r.getCell(row,4).value.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  expect(r.getCell(row,5).value).toBe(1250.7);expect(r.getCell(row,6).value).toEqual({formula:'E6*2',result:2501.4});
  expect(r.getRow(row).height).toBeGreaterThan(60);expect(r.autoFilter).toBe(`A${t.headerRow}:F${row}`);
 });
 it('preserva filtro específico e não escolhe a última tabela de um relatório com vários blocos',async()=>{
  for(const filtro of [null,'A2:B3']){
   const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Blocos');
   adicionarHeaderTabela(ws,2,['Marca','Quantidade']);adicionarLinhaTabela(ws,3,['C1',2]);adicionarLinhaTotais(ws,4,['TOTAL',2]);
   adicionarHeaderTabela(ws,6,['Cliente','Valor']);adicionarLinhaTabela(ws,7,['Teste',50]);if(filtro)ws.autoFilter=filtro;
   const r=(await reabrir(wb)).worksheets[0];expect(r.autoFilter||null).toBe(filtro);
  }
 });
 it('não transforma identificadores parecidos com datas nem datas inválidas',async()=>{
  const wb=await criarExcelTabular({titulo:'Dados',abas:[{nome:'Dados',headers:['Marca','Data'],linhas:[['07/09/2026','31/02/2026']]}]});
  const row=wb.worksheets[0]._torgTabelas[0].headerRow+1;
  const r=(await reabrir(wb)).worksheets[0];expect(r.getCell(row,1).value).toBe('07/09/2026');expect(r.getCell(row,2).value).toBe('31/02/2026');
 });
 it('relatório vazio conserva a mensagem e o total em linhas diferentes',async()=>{
  const wb=await criarExcelTabular({titulo:'Vazio',abas:[{nome:'Resumo',headers:['Movimento','Valor'],linhas:[],totais:['TOTAL',0]}]});
  const h=wb.worksheets[0]._torgTabelas[0].headerRow;
  const r=(await reabrir(wb,'vazio')).worksheets[0];expect(r.getCell(h+1,1).value).toMatch(/Nenhum registro/);expect(r.getCell(h+2,2).value).toBe(0);
 });
 it('listas com vírgulas e mais de 255 caracteres permanecem completas após serializar duas vezes',async()=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Modelo');
  const produtos=Array.from({length:100},(_,i)=>`Perfil ${i}, espessura especial`);
  const nome=listaValidacaoExcel(wb,'TORG_Produtos',produtos);
  ws.getCell('A1').dataValidation={type:'list',formulae:[nome]};
  refinarWorkbookExcel(wb);const r=await reabrir(wb);
  expect(r.getWorksheet('Opções Torg').state).toBe('veryHidden');
  expect(r.getWorksheet('Opções Torg').getCell('A100').value).toBe(produtos[99]);
  expect(r.definedNames.getRanges(nome).ranges).toEqual(["'Opções Torg'!$A$1:$A$100"]);
 });
 it('modelos de importação mantêm nomes de abas, cabeçalho na linha 1, códigos e tipos',async()=>{
  const dados={Funcionários:[['CPF','PIS','Data','Percentual'],['00123456789','00012345678','07/09/2026','25%']],Instruções:[['INSTRUÇÕES'],['Não alterar cabeçalhos']]};
  const r=await reabrir(await refinarModeloImportacao(externo(dados)),'modelo-importacao');
  const relido=XLSX.read(await r.xlsx.writeBuffer(),{type:'buffer'});
  expect(relido.SheetNames).toEqual(Object.keys(dados));
  for(const [nome,linhas] of Object.entries(dados))expect(XLSX.utils.sheet_to_json(relido.Sheets[nome],{header:1})).toEqual(linhas);
 });
});

describe('arquivos de engenharia recebidos',()=>{
 it.each(['proteção','validação','código formatado','percentual formatado'])('preserva o original quando a conversão não mantém %s',async(tipo)=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('LPC');
  ws.addRows([['Marca','Quantidade'],[97,2]]);
  if(tipo==='proteção')await ws.protect('teste');
  if(tipo==='validação')ws.getCell('B2').dataValidation={type:'whole',operator:'greaterThan',formulae:[0]};
  if(tipo==='código formatado')ws.getCell('A2').numFmt='00000';
  if(tipo==='percentual formatado'){ws.getCell('B2').value=.25;ws.getCell('B2').numFmt='0%';}
  const convertido=await padronizarPlanilha(Buffer.from(await wb.xlsx.writeBuffer()));
  expect(convertido===null).toBe(true);
 });

 it.each(['linha','coluna'])('recusa arquivo externo com %s oculta sem revelar seu conteúdo',async(tipo)=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('LPC');
  ws.addRows([['Marca','Quantidade','Observação'],['C1',2,'Público'],['C2',3,'Conteúdo oculto']]);
  if(tipo==='linha')ws.getRow(3).hidden=true;else ws.getColumn(3).hidden=true;
  expect(await padronizarPlanilha(Buffer.from(await wb.xlsx.writeBuffer()))).toBeNull();
 });

 it('preserva todas as abas e mais de 20 colunas',async()=>{
  const headers=['Marca','Quantidade',...Array.from({length:23},(_,i)=>`Campo ${i}`)];
  const linha=['C1',2,...Array.from({length:23},(_,i)=>`Dado ${i}`)];
  const r=await reabrir(await padronizarPlanilha(bytes(externo({LPC:[headers,linha],LE:[['Marca','Quantidade'],['C2',3]]}))),'externo');
  expect(r.worksheets.map(w=>w.name)).toEqual(['LPC','LE']);expect(r.worksheets[0].columnCount).toBe(25);
  let encontrada;r.worksheets[0].eachRow(row=>{if(row.getCell(1).value==='C1')encontrada=row;});expect(encontrada.getCell(25).value).toBe('Dado 22');
 });
 it('omite peso em todas as abas e nos metadados do topo',async()=>{
  const r=await reabrir(await padronizarPlanilha(bytes(externo({LPC:[['Peso total',123456],['Marca','Quantidade','Peso (kg)'],['C1',2,123456]],LE:[['Marca','Quantidade','Peso unitário'],['C2',3,654321]]})),{semPeso:true}));
  for(const ws of r.worksheets){ws.eachRow(row=>row.eachCell(c=>{expect(String(c.value)).not.toMatch(/peso|123456|654321/i);}));expect(ws.columnCount).toBe(2);}
 });
 it('não achata fórmulas nem entrega só as abas reconhecidas',async()=>{
  const wb=externo({LPC:[['Marca','Quantidade'],['C1',2]]});wb.Sheets.LPC.B2={t:'n',v:2,f:'1+1'};
  expect(await padronizarPlanilha(bytes(wb))).toBeNull();
  expect(await padronizarPlanilha(bytes(externo({LPC:[['Marca','Quantidade'],['C1',2]],Outra:[['Texto sem tabela']]})))).toBeNull();
 });
 it('recusa colunas de peso que mudam de posição entre blocos e estrutura oculta',async()=>{
  expect(await padronizarPlanilha(bytes(externo({LPC:[['Marca','Quantidade','Peso'],['C1',2,30],['Marca','Peso','Quantidade'],['C2',30,2]]})),{semPeso:true})).toBeNull();
  const wb=externo({LPC:[['Marca','Quantidade'],['C1',2]]});wb.Workbook={Sheets:[{name:'LPC',Hidden:1}]};expect(await padronizarPlanilha(bytes(wb))).toBeNull();
 });
});

describe('romaneio oficial FORM 22',()=>{
 it('mantém campos, total e histórico e não reduz uma carga inteira a uma página',async()=>{
  const r=await reabrir(await gerarRomaneioForm22({op:{numero:'097',cliente:'Cliente de teste'},romaneio:{numero:12,data:'2026-09-07'},itens:[{marca:'0001',qtd:3,pesoKg:105.5,descricao:'Viga de teste'}],historico:[{revisao:1,emitidoEm:'2026-09-07',mudanca:'Revisão demonstrativa',porQuem:'Equipe'}]}),'romaneio');
  const ws=r.worksheets[0];expect(ws.getCell('D32').value).toBe('0001');expect(ws.getCell('E32').value).toBe(3);expect(ws.getCell('J33').value).toBe(105.5);
  expect(ws.pageSetup.fitToHeight).toBe(0);expect(ws.pageSetup.printArea).toBe('A1:J546');expect(r.getWorksheet('Historico')).toBeTruthy();
  expect(ws.getColumn('AA').hidden).toBe(true);expect(ws.getColumn('J').hidden).not.toBe(true);
  expect(ws.getCell('B1').value.toISOString()).toBe('2026-09-07T00:00:00.000Z');expect(ws.getCell('J23').value).toBeNull();
  expect(ws.getCell('C33').value).toBe('Total Geral');expect(ws.getColumn('A').hidden).toBe(true);
 });
 it('impede itens de sobrescreverem os campos de assinatura',async()=>{
  await expect(gerarRomaneioForm22({op:{},romaneio:{},itens:Array.from({length:498},(_,i)=>({marca:`C${i}`}))})).rejects.toThrow('497');
 });
 it('romaneio refinado continua sendo importado com todas as marcas e o mesmo total',async()=>{
  const buf=await gerarRomaneioForm22({op:{numero:'097'},romaneio:{numero:12,data:'2026-09-07'},itens:[{marca:'0001',qtd:3,pesoKg:105.5},{marca:'0002',qtd:2,pesoKg:20}]});
  const r=parseRomaneio(buf,'Romaneio 12.xlsx');
  expect(r.ok).toBe(true);expect(r.itens.map(i=>[i.marca,i.qtd,i.pesoKg])).toEqual([['0001',3,105.5],['0002',2,20]]);
  expect(r.totais.pesoDeclarado).toBe(125.5);expect(r.totais.pesoSomado).toBe(125.5);
 });
});
