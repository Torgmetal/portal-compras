// Tabelas externas podem ganhar a apresentação Torg; arquivos com fórmulas,
// macros ou estrutura não reconhecida seguem intactos. Nunca entregar só a
// primeira aba ou truncar colunas para caber no novo desenho.
import * as XLSX from 'xlsx';
import PizZip from 'pizzip';
import {criarRelatorioTorg,adicionarFolhaTorg,adicionarHeaderTabela,adicionarLinhaTabela,bufferWorkbookTorg} from './excel-relatorio';
const peso=v=>/\bpeso\b|\bweight\b/i.test(String(v||''));
const preenchidas=l=>(l||[]).filter(v=>v!==''&&v!=null);
const cabecalho=l=>preenchidas(l).filter(v=>typeof v==='string'&&/^(posi[cç][aã]o|marca|qtd\.?|qtde\.?|quantidade|material|descri[cç][aã]o|perfil|peso|weight|comprimento|[aá]rea)(\s*(unit\.?|unit[aá]rio|total|pintura|\([^)]*\)))?$/i.test(v.trim())).length>=2;
export async function padronizarPlanilha(buf,{titulo,subtitulo,codigoDoc,semPeso}={}){
 // O leitor tabular não preserva desenhos, gráficos ou objetos incorporados.
 // Nesses casos, recusar a transformação é melhor que eliminar parte do arquivo.
 if(buf?.[0]===0x50&&buf?.[1]===0x4b){
  try{
   const zip=new PizZip(buf),nomes=Object.keys(zip.files);
   if(nomes.some(n=>/^xl\/(drawings|charts|pivotTables|externalLinks|embeddings)\//.test(n)))return null;
   // O leitor tabular não conserva proteção nem validação de células.
   if(nomes.filter(n=>/^xl\/worksheets\/[^/]+\.xml$/.test(n)).some(n=>/<(?:[\w.-]+:)?(?:sheetProtection|dataValidations)\b/.test(zip.files[n].asText())))return null;
  }catch{return null;}
 }
 let original;
 try{original=XLSX.read(buf,{type:'buffer',cellDates:true,cellFormula:true,cellStyles:true,cellNF:true,bookVBA:true});}catch{return null;}
 if(original.vbaraw||!original.SheetNames.length||original.Workbook?.Names?.length)return null;
 const abas=[];
 for(const nome of original.SheetNames){
  const ws=original.Sheets[nome];
  if(!ws||Object.entries(ws).some(([k,v])=>!k.startsWith('!')&&(v.f||v.F||v.l||v.c||v.t==='e')))return null;
  // Formatos numéricos podem codificar zeros iniciais, percentuais ou unidades.
  if(Object.entries(ws).some(([k,v])=>!k.startsWith('!')&&v.t==='n'&&v.z&&v.z!=='General'))return null;
  if(ws['!ref']){const range=XLSX.utils.decode_range(ws['!ref']);if(range.e.r-range.s.r>4999||range.e.c-range.s.c>99)return null;}
  if((ws['!rows']||[]).some(r=>r?.hidden)||(ws['!cols']||[]).some(c=>c?.hidden)||original.Workbook?.Sheets?.find(s=>s.name===nome)?.Hidden)return null;
  const linhas=XLSX.utils.sheet_to_json(ws,{header:1,blankrows:true,defval:'',raw:true});
  if(!linhas.length||linhas.length>5000)return null;
  const nCols=linhas.reduce((n,l)=>Math.max(n,l.length),0);
  if(nCols>100)return null;
  const iCab=linhas.slice(0,40).findIndex(cabecalho);if(iCab<0)return null;
  const removidas=semPeso?linhas[iCab].flatMap((v,i)=>peso(v)?[i]:[]):[];
  if(semPeso&&linhas.slice(iCab+1).some(l=>cabecalho(l)&&l.some((v,i)=>peso(v)&&!removidas.includes(i))))return null;
  const usadas=Array.from({length:nCols},(_,i)=>i).filter(i=>!removidas.includes(i));
  if(usadas.length<1)return null;
  abas.push({nome,linhas,iCab,usadas});
 }
 let workbook;
 for(const {nome,linhas,iCab,usadas} of abas){
  const opts={titulo:titulo||nome,subtitulo,codigoDoc:codigoDoc||'REL-ENG-003',nomePlanilha:nome,totalColunas:usadas.length};
  const folha=workbook?await adicionarFolhaTorg(workbook,opts):await criarRelatorioTorg(opts);workbook ||= folha.workbook;
  const {sheet}=folha;let r=folha.linhaInicio;
  sheet.columns=usadas.map(i=>({width:Math.min(44,Math.max(12,...linhas.slice(iCab,iCab+200).map(l=>String(l[i]??'').length+2)))}));
  for(const l of linhas.slice(0,iCab)){
   if(semPeso&&l.some(peso))continue;
   adicionarLinhaTabela(sheet,r++,usadas.map(i=>l[i]??''),{fillColor:'F0F4F8'});
  }
  adicionarHeaderTabela(sheet,r++,usadas.map(i=>String(linhas[iCab][i]??'')));
  for(const l of linhas.slice(iCab+1)){
   const valores=usadas.map(i=>l[i]??'');
   if(cabecalho(l))adicionarHeaderTabela(sheet,r++,valores);
   else adicionarLinhaTabela(sheet,r++,valores);
  }
 }
 return Buffer.from(await bufferWorkbookTorg(workbook));
}
