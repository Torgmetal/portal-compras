import {it,expect,vi} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import ExcelJS from 'exceljs';
const captura=vi.hoisted(()=>({wb:null}));
vi.mock('@/lib/excel-relatorio',async(importOriginal)=>({...await importOriginal(),downloadWorkbook:vi.fn(async wb=>{captura.wb=wb;})}));
import {baixarCadernoPintura} from '@/lib/pintura-excel-cliente';
import {bufferWorkbookTorg} from '@/lib/excel-refinamento';

it('preserva as fórmulas entre as três folhas de pintura e as células amarelas',async()=>{
 const camada={ordem:1,produto:'Primer de teste',cor:'Azul',seca:100,sv:80,diluicaoPct:10,secagem:'8 horas'};
 const dados={op:{numero:'097',cliente:'Cliente de teste',obra:'Obra de teste'},quantidade:{pecas:3,kg:100,m2:50,demaos:1,m2Aplicar:50,litros:7.35,galoes:3,baldes:1,recebidoEmbalagens:0,embalagensSemTamanho:0},falta:[],pecas:[{marca:'0001',descricao:'Conjunto de teste',perfil:'W200',qte:3,kg:100,m2:50,cor:'Azul'}],porCor:[],cmr:[],camadas:[camada],demaos:[camada]};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>dados})));
 try{
  await baixarCadernoPintura('097');const wb=captura.wb;
  const formulasAntes=[];wb.worksheets.forEach(ws=>ws.eachRow(r=>r.eachCell(c=>{if(c.type===6)formulasAntes.push([ws.name,c.address,c.formula]);})));
  const buf=await bufferWorkbookTorg(wb),r=new ExcelJS.Workbook();await r.xlsx.load(buf);
  expect(r.worksheets.map(ws=>ws.name)).toEqual(['1. Quantidade','2. Qual tinta usar','3. Para o pintor']);
  expect(formulasAntes.length).toBeGreaterThan(5);
  for(const [nome,endereco,formula] of formulasAntes)expect(r.getWorksheet(nome).getCell(endereco).formula).toBe(formula);
  const w2=r.worksheets[1];let camadaRow;w2.eachRow(row=>{if(row.getCell(2).value==='Primer de teste')camadaRow=row;});
  expect(camadaRow.getCell(5).value).toBe(80);expect(camadaRow.getCell(5).fill.fgColor.argb).toBe('FFFDF3D0');
  // Duas tabelas independentes não recebem um filtro aplicado só à última.
  expect(w2.autoFilter).toBeUndefined();
  let aviso;w2.eachRow(row=>{if(String(row.getCell(1).value).startsWith('Amarelo ='))aviso=row;});
  expect(aviso.getCell(1).isMerged).toBe(true);expect(aviso.height).toBeLessThan(70);
  if(process.env.EXCEL_QA_DIR){await mkdir(process.env.EXCEL_QA_DIR,{recursive:true});await writeFile(`${process.env.EXCEL_QA_DIR}/pintura.xlsx`,Buffer.from(buf));}
 }finally{vi.unstubAllGlobals();}
});
