import {NextResponse} from 'next/server';
import * as XLSX from 'xlsx';
import {prisma} from '@/lib/prisma';
import {requireRole} from '@/lib/session';
import {linhasDaTabela,conferirItensTerceiro} from '@/lib/terceiros-importar-itens';
export const runtime='nodejs';
export async function POST(req){
 try{await requireRole(['ADMIN','EXPEDICAO','PRODUCAO','COMERCIAL','ALMOXARIFADO','PCP','PLANEJAMENTO','COMPRAS']);}
 catch(e){return NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:403});}
 try{
  const form=await req.formData(),opId=form.get('opId'),arquivo=form.get('arquivo'),texto=form.get('texto');
  if(typeof opId!=='string'||!opId)throw Error('Selecione a OP antes de importar.');
  const op=await prisma.oP.findUnique({where:{id:opId},select:{numero:true}});if(!op)throw Error('OP não encontrada.');
  let tabela,nome;
  if(arquivo&&typeof arquivo!=='string'){
   if(arquivo.size>4*1024*1024||!(/\.(xlsx?|csv)$/i.test(arquivo.name)))throw Error('Use XLSX, XLS ou CSV de até 4 MB.');
   const buffer=Buffer.from(await arquivo.arrayBuffer());
   const csv=/\.csv$/i.test(arquivo.name);
   const wb=XLSX.read(csv?buffer.toString('utf8'):buffer,{type:csv?'string':'buffer',raw:csv,sheetRows:2002});
   const ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw Error('A planilha está vazia.');
   // Rejeita truncamento em vez de omitir peças além do limite de leitura.
   if(ws['!fullref'])throw Error('Planilha extensa. Importe no máximo 2.000 linhas por vez.');
   tabela=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
   // Marcas numéricas podem ter zeros à esquerda definidos na formatação do Excel.
   const h=tabela.findIndex(r=>r.some(c=>String(c).trim().toLowerCase()==='marca'));
   const mi=h<0?0:tabela[h].findIndex(c=>String(c).trim().toLowerCase()==='marca');
   const inicio=XLSX.utils.decode_range(ws['!ref']||'A1').s;
   for(let r=Math.max(0,h+1);r<tabela.length;r++){const cell=ws[XLSX.utils.encode_cell({r:r+inicio.r,c:mi+inicio.c})];if(cell?.t==='n')tabela[r][mi]=cell.w||String(cell.v);}
   nome=`${arquivo.name} · ${wb.SheetNames[0]}`;
  }else{
   if(typeof texto!=='string'||texto.length>200000)throw Error('Cole uma lista de até 2.000 linhas.');
   // Texto colado do Excel usa tabulação; listas simples aceitam ponto e vírgula.
   tabela=texto.split(/\r?\n/).map(l=>l.includes('\t')?l.split('\t'):l.includes(';')?l.split(';'):[l.trim()]);nome='Lista colada';
  }
  const linhas=linhasDaTabela(tabela);if(!linhas.length)throw Error('Nenhuma peça encontrada na lista.');
  const catalogo=await prisma.pecaConjunto.findMany({where:{opId,OR:[{destino:null},{destino:{not:'CANCELADA'}}]},select:{id:true,marca:true,opNumero:true,descricao:true,qte:true,pesoUnitKg:true,pesoTotalKg:true}});
  return NextResponse.json({nome,linhas:conferirItensTerceiro(linhas,catalogo,op.numero)});
 }catch(e){return NextResponse.json({error:e.message||'Não foi possível ler a lista.'},{status:400});}
}
