// Acabamento visual compartilhado, aplicado antes de serializar. Não desloca
// células, não recalcula valores e preserva fórmulas, validações e cores de status.
const AZUL='00406B', CINZA='E5EBF0', ALTERNADA='F5F9FC';
const texto=v=>v==null?'':v instanceof Date?'00/00/0000 00:00':typeof v==='object'?v.richText?.map(t=>t.text).join('')||v.text||String(v.result??''):String(v);
const coluna=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const letra=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
function dataExibida(v){
 const m=String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);if(!m)return null;
 const [,d,mes,ano,h='0',min='0',seg='0']=m;
 const date=new Date(Date.UTC(+ano,+mes-1,+d,+h,+min,+seg));
 return date.getUTCDate()===+d&&date.getUTCMonth()===+mes-1&&+h<24&&+min<60&&+seg<60?{date,formato:m[6]?'dd/mm/yyyy hh:mm:ss':m[4]?'dd/mm/yyyy hh:mm':'dd/mm/yyyy'}:null;
}

export function registrarTabelaExcel(ws,linha,headers){
 ws._torgTabelas ||= [];
 const t={headerRow:linha,cols:headers.length,headers:[...headers],rows:new Set(),totais:new Set()};
 ws._torgTabelas.push(t);return t;
}

export function refinarPlanilhaExcel(ws,{cabecalho,ultimaLinha,colunas,preservarAlturas=false}={}){
 const tabelas=(ws._torgTabelas ||= []);
 if(cabecalho&&!tabelas.length){
  const n=colunas||ws.columnCount;
  const t=registrarTabelaExcel(ws,cabecalho,Array.from({length:n},(_,i)=>texto(ws.getCell(cabecalho,i+1).value)));
  for(let r=cabecalho+1;r<=(ultimaLinha||ws.rowCount);r++)t.rows.add(r);
 }
 ws.properties.tabColor ||= {argb:'006EAB'};
 const views=ws.views?.length?ws.views:[{}];
 ws.views=views.map(v=>({...v,showGridLines:false}));
 if(tabelas.length===1&&!ws.views.some(v=>v.state==='frozen'||v.state==='split'))ws.views=[{...ws.views[0],state:'frozen',ySplit:tabelas[0].headerRow}];
 // Avisos entre tabelas costumavam transbordar pela linha. Com wrap, reservar
 // essa mesma largura evita uma coluna de texto estreita e centenas de pontos
 // de altura. Não mescla registros, fórmulas ou modelos de importação.
 if(ws._torgRelatorio&&!ws._torgPreservarValores&&ws.columnCount>1){
  const ocupadas=new Set(tabelas.flatMap(t=>[t.headerRow,...t.rows]));
  ws.eachRow(row=>{
   if(row.number<=3||ocupadas.has(row.number))return;
   const valores=[];row.eachCell(c=>{if(c.value!=null&&c.value!=='')valores.push(c);});
   if(valores.length!==1)return;
   const c=valores[0];
   if(typeof c.value==='string'&&!c.isMerged&&c.col<ws.columnCount&&c.value.length>(ws.getColumn(c.col).width||12))ws.mergeCells(row.number,c.col,row.number,ws.columnCount);
  });
 }
 const mesclas=new Map();
 for(const ref of ws.model.merges||[]){
  const m=ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);if(!m)continue;
  mesclas.set(m[1]+m[2],{c1:coluna(m[1]),c2:coluna(m[3]),r1:Number(m[2]),r2:Number(m[4])});
 }
 // Cada tabela conhece seus dados; subtotais e assinaturas não entram no filtro.
 for(const t of tabelas){
  for(let c=1;c<=t.cols;c++){
   const cell=ws.getCell(t.headerRow,c);
   cell.font={...cell.font,name:'Arial',size:cell.font?.size||10,bold:true,color:{argb:'FFFFFF'}};
   cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:AZUL}};
   cell.alignment={...cell.alignment,vertical:'middle',horizontal:'center',wrapText:true};
  }
  if(!preservarAlturas)ws.getRow(t.headerRow).height=Math.max(30,ws.getRow(t.headerRow).height||0);
  for(const r of t.rows){
   const total=t.totais.has(r);
   for(let c=1;c<=t.cols;c++){
    const cell=ws.getCell(r,c);if(cell.isMerged&&cell.master.address!==cell.address)continue;
    if(!total&&!cell.fill?.fgColor&&!cell.fill?.bgColor)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:(r-t.headerRow)%2===0?ALTERNADA:'FFFFFF'}};
    if(!total&&!cell.border?.bottom)cell.border={...cell.border,bottom:{style:'hair',color:{argb:CINZA}}};
    // Só percentuais explicitamente escritos com %: nenhuma suposição sobre a
    // escala de um número existente, nem alteração de fórmulas/identificadores.
    if(!ws._torgPreservarValores&&typeof cell.value==='string'&&/^[-+]?\d+(?:[.,]\d+)?\s*%$/.test(cell.value.trim())){
     cell.value=Number(cell.value.trim().replace('%','').replace(',','.'))/100;
     cell.numFmt='0.0%';
     cell.alignment={...cell.alignment,horizontal:'right'};
    }
    if(!ws._torgPreservarValores&&typeof cell.value==='string'&&/data|vencimento|validade|recebido em|emiss[aã]o|emitido em|pagamento|conferido em|[uú]ltim[oa]|in[ií]cio|fim|prevista/i.test(t.headers[c-1]||'')){
     const data=dataExibida(cell.value.trim());if(data){cell.value=data.date;cell.numFmt=data.formato;}
    }
    const numero=typeof cell.value==='number'?cell.value:typeof cell.value?.result==='number'?cell.value.result:null;
    if(numero!==null&&(!cell.numFmt||cell.numFmt==='General')){
     const h=t.headers[c-1]||'';
     cell.numFmt=/R\$|\b(kg|valor|preço|custo|salário|INSS|IRRF|FGTS|verba)\b/i.test(h)?'#,##0.00':Number.isInteger(numero)?'#,##0':'#,##0.###';
    }
   }
  }
 }
 let maxRow=1,maxCol=1;
 ws.eachRow(row=>{
  let altura=row.height||18;
  row.eachCell(cell=>{
   if(cell.isMerged&&cell.master.address!==cell.address)return;
   if(cell.value==null)return;
   const m=mesclas.get(cell.address),c1=m?.c1||cell.col,c2=m?.c2||cell.col;
   maxRow=Math.max(maxRow,m?.r2||row.number);maxCol=Math.max(maxCol,c2);
   let largura=0;for(let c=c1;c<=c2;c++)largura+=ws.getColumn(c).width||12;
   const v=cell.value,txt=texto(v),size=cell.font?.size||10;
   cell.font={name:'Arial',size:10,...cell.font};
   cell.alignment={...cell.alignment,vertical:cell.alignment?.vertical||'middle',horizontal:cell.alignment?.horizontal||(typeof v==='number'||v?.formula||v?.sharedFormula?'right':'left'),wrapText:true};
   // Altura mínima calculada na largura final (os chamadores definem colunas
   // depois do cabeçalho). Respeita fontes grandes usadas no chão de fábrica.
   const linhas=txt.split(/\r?\n/).reduce((n,l)=>n+Math.max(1,Math.ceil(l.length/Math.max(4,(largura-2)*10/size))),0);
   if(!m||m.r1===m.r2)altura=Math.max(altura,linhas*size*1.25+7);
  });
  if(!preservarAlturas)row.height=Math.min(409,altura);
 });
 if(!ws.pageSetup.printArea)ws.pageSetup.printArea=`A1:${letra(maxCol)}${maxRow}`;
 if(tabelas.length===1){
  const t=tabelas[0],fim=[...t.rows].reduce((fim,r)=>t.totais.has(r)?fim:Math.max(fim,r),t.headerRow);
  if(!ws.autoFilter)ws.autoFilter={from:{row:t.headerRow,column:1},to:{row:fim,column:t.cols}};
  if(!ws.pageSetup.printTitlesRow)ws.pageSetup.printTitlesRow=`${ws._torgRelatorio&&!ws._torgPreservarValores?1:t.headerRow}:${t.headerRow}`;
 }
 // Relatórios largos precisam de papel maior, não de toda a tabela reduzida
 // para A4. Formulários oficiais e modelos de importação mantêm seu contrato.
 if(ws._torgRelatorio&&!ws._torgPreservarValores){
  const largura=Array.from({length:maxCol},(_,i)=>ws.getColumn(i+1)).reduce((n,c)=>n+(c.hidden?0:c.width||12),0);
  if(largura>210&&(!ws.pageSetup.paperSize||ws.pageSetup.paperSize===9)){
   ws.pageSetup.paperSize=8;
   ws.pageSetup.orientation='landscape';
  }
 }
 return ws;
}

export function refinarWorkbookExcel(wb){
 if(wb._torgListas?.size){
  const opcoes=wb.getWorksheet('Opções Torg')||wb.addWorksheet('Opções Torg',{state:'veryHidden'});
  let c=1;
  for(const [nome,op] of wb._torgListas){
   op.forEach((v,i)=>{opcoes.getCell(i+1,c).value=v;});
   wb.definedNames.add(`'Opções Torg'!$${letra(c)}$1:$${letra(c)}$${op.length}`,nome);c++;
  }
 }
 for(const ws of wb.worksheets)if(ws._torgTabelas||ws._torgRelatorio)refinarPlanilhaExcel(ws);
 return wb;
}

// Lista literal do Excel limita 255 caracteres e trata vírgulas dos nomes como
// separadores. Intervalo nomeado preserva todos os produtos e perfis do catálogo.
export function listaValidacaoExcel(wb,nome,valores){
 wb._torgListas ||= new Map();wb._torgListas.set(nome,valores.length?[...new Set(valores)]:['']);
 return nome;
}

export function refinarFormularioExcel(wb){
 wb.calcProperties.fullCalcOnLoad=true;
 for(const ws of wb.worksheets){
  if(ws.state==='veryHidden'||ws.state==='hidden')continue;
  ws._torgRelatorio=true;ws._torgPreservarValores=true;
  ws.headerFooter={...ws.headerFooter,oddFooter:'&LTorg Metal — Workspace&R Página &P de &N'};
  const t=ws.getCell('A1');
  if(typeof t.value==='string'){
   if(!t.value.includes('TORG'))t.value='TORG METAL · '+t.value;
   t.fill={type:'pattern',pattern:'solid',fgColor:{argb:AZUL}};
   t.font={...t.font,name:'Arial',bold:true,color:{argb:'FFFFFF'}};
   t.border={...t.border,bottom:{style:'medium',color:{argb:'F4801F'}}};
  }
  ws.pageSetup.fitToHeight=0;ws.pageSetup.fitToWidth=1;ws.pageSetup.fitToPage=true;
  ws.eachRow(row=>row.eachCell({includeEmpty:true},cell=>{
   if(cell.protection?.locked===false&&cell.type!==6)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF5DB'}};
  }));
 }
 return wb;
}

export async function bufferWorkbookTorg(wb){
 refinarWorkbookExcel(wb);
 return wb.xlsx.writeBuffer();
}
