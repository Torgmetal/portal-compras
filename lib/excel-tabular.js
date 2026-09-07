import {criarRelatorioTorg,adicionarFolhaTorg,adicionarHeaderTabela,adicionarLinhaTabela,adicionarLinhaTotais} from './excel-relatorio';

/** Relatórios simples, preservando valores tipados e a ordem de todas as abas. */
export async function criarExcelTabular({titulo,subtitulo,codigoDoc,abas}){
 let workbook;
 for(const aba of abas){
  const opts={titulo:aba.titulo||titulo,subtitulo:aba.subtitulo||subtitulo,codigoDoc,nomePlanilha:aba.nome,totalColunas:aba.headers.length};
  const folha=workbook?await adicionarFolhaTorg(workbook,opts):await criarRelatorioTorg(opts);
  workbook ||= folha.workbook;
  const {sheet,linhaInicio}=folha;
  sheet.columns=aba.headers.map((h,i)=>({width:aba.larguras?.[i]||Math.min(45,Math.max(14,String(h).length+3,...aba.linhas.slice(0,100).map(l=>Math.min(45,String(l[i]??'').length+2))))}));
  adicionarHeaderTabela(sheet,linhaInicio,aba.headers);
  aba.linhas.forEach((linha,i)=>adicionarLinhaTabela(sheet,linhaInicio+i+1,linha));
  if(aba.totais)adicionarLinhaTotais(sheet,linhaInicio+Math.max(1,aba.linhas.length)+1,aba.totais);
  for(const [col,formato] of Object.entries(aba.formatos||{}))sheet.getColumn(Number(col)).numFmt=formato;
  if(!aba.linhas.length){const r=linhaInicio+1;if(aba.headers.length>1)sheet.mergeCells(r,1,r,aba.headers.length);sheet.getCell(r,1).value='Nenhum registro para os filtros selecionados.';sheet.getRow(r).height=30;}
 }
 return workbook;
}

/** Modelos de importação: só aparência; a primeira aba, cabeçalhos e endereços
 * continuam idênticos ao contrato de leitura existente. */
export async function refinarModeloImportacao(xlsxWorkbook,{titulo='Modelo de importação'}={}){
 const XLSX=await import('xlsx');
 const ExcelJS=(await import('exceljs')).default;
 const {refinarPlanilhaExcel}=await import('./excel-refinamento');
 const wb=new ExcelJS.Workbook();
 await wb.xlsx.load(XLSX.write(xlsxWorkbook,{type:'array',bookType:'xlsx'}));
 wb.creator='Torg Metal — Workspace';
 for(const ws of wb.worksheets){
  ws._torgPreservarValores=true;
  const instrucoes=/instru/i.test(ws.name);
  const referencia=/refer[eê]ncia/i.test(ws.name);
  if(instrucoes&&ws.columnCount>1&&ws.getRow(1).values.slice(2).every(v=>v==null||v==='')){
   ws.mergeCells(1,1,1,ws.columnCount);
   ws.getCell('A1').font={name:'Arial',size:13,bold:true,color:{argb:'00406B'}};
   ws.getCell('A1').border={bottom:{style:'medium',color:{argb:'F4801F'}}};
  }
  refinarPlanilhaExcel(ws,{cabecalho:instrucoes?(ws.getCell('A3').value==='Campo'?3:undefined):1});
  ws.headerFooter={oddHeader:`&L&BTORG METAL&B&C${titulo}&R${ws.name}`,oddFooter:'&LTorg Metal&R Página &P de &N'};
  ws.pageSetup={...ws.pageSetup,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  if(!instrucoes&&!referencia)ws.eachRow((r,n)=>{if(n>1)r.eachCell(c=>{if(c.type!==6)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF5DB'}};});});
 }
 return wb;
}
