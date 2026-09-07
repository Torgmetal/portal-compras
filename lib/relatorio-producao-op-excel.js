import {criarRelatorioTorg,adicionarFolhaTorg,adicionarHeaderTabela,adicionarLinhaTabela} from './excel-relatorio';
import {ETAPAS_PLANILHA_OP} from './relatorio-producao-op';

const nomes={PREPARACAO:'Preparação',MONTAGEM:'Montagem',SOLDA:'Solda',ACABAMENTO:'Acabamento',JATO:'Jato',PINTURA:'Pintura',EXPEDICAO:'Expedição'};
const notas={
 PREPARACAO:'LPC por conjunto e croqui. Qtd. do vínculo já é o total da LPC. Preparado na OP é o acumulado da marca: não somar repetições de croquis compartilhados. Parciais sem vínculo identificado ficam sem quantidade atribuída ao conjunto. O peso dos croquis já está incluído no peso do conjunto.',
 EXPEDICAO:'Base: LE. Somente quantidades de romaneios emitidos ou vinculados à marca são tratadas como embarque. Baixas sem romaneio ficam separadas. Sinalização de arquivo sem quantidade e possíveis duplicidades exigem conferência.',
 PADRAO:'Uma linha por conjunto ou avulsa da LPC, sem repetir croquis. Produção acumulada do próprio setor. Não se aplica indica etapa fora da rota. Peças sem apontamento continuam listadas.',
};
// MesOrdem guarda o relógio local como UTC-naïve; a data Excel preserva esse relógio.
const dataSyneco=v=>v&&!Number.isNaN(new Date(v).getTime())?new Date(v):null;
export async function planilhaProducaoOp(dados){
 let workbook;
 for(const setor of ETAPAS_PLANILHA_OP){
  const prep=setor==='PREPARACAO',exp=setor==='EXPEDICAO';
  const headers=prep?['Conjunto','Posição / marca','Tipo','Qtd. LPC neste vínculo','Material','Descrição / perfil','Comprimento (mm)','Peso unit. (kg)','Peso vínculo (kg)','Área pintura (m²)','Preparado neste vínculo','Pendente neste vínculo','% preparado','Situação','Qtd. marca na OP','Preparado da marca na OP','Conjuntos que usam o croqui','Último apontamento','Observação LPC']:
   exp?['Marca','Descrição','Frente','Qtd. LE','Expedido comprovado','Pendente de comprovação','% expedido','Situação','Baixa sem romaneio','Romaneios / baixas','Peso LE (kg)']:
   ['Conjunto / marca','Tipo','Descrição / perfil','Qtd. LPC','Produzido','Pendente','% executado','Situação','Peso LPC (kg)','Último apontamento','Observação LPC'];
  const opts={titulo:`OP-${dados.op.numero} · ${nomes[setor]}`,subtitulo:`${dados.op.cliente||''} · ${dados.op.obra||''}`,kpis:[`Syneco: ${dados.sincronizadoEm?new Date(dados.sincronizadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'sincronização não informada'}`],totalColunas:headers.length,nomePlanilha:nomes[setor],codigoDoc:'REL-PRD-005'};
  const folha=workbook?await adicionarFolhaTorg(workbook,opts):await criarRelatorioTorg(opts);
  if(!workbook)workbook=folha.workbook;
  const {sheet,linhaInicio}=folha;
  sheet.columns=headers.map(h=>({width:/Descrição|Situação|Observação|Conjuntos que|Romaneios/.test(h)?38:/Último/.test(h)?23:19}));
  sheet.mergeCells(linhaInicio,1,linhaInicio,headers.length);sheet.getCell(linhaInicio,1).value=notas[setor]||notas.PADRAO;sheet.getCell(linhaInicio,1).alignment={wrapText:true,vertical:'middle'};sheet.getRow(linhaInicio).height=38;
  const cab=linhaInicio+1;adicionarHeaderTabela(sheet,cab,headers);sheet.getRow(cab).height=36;
  const linhas=dados.setores[setor]||[];
  linhas.forEach((p,i)=>{
   const r=cab+1+i;
   const valores=prep?[p.conjunto,p.marca,p.tipo,p.qte,p.material,p.descricao||p.perfil,p.comprimentoMm,p.pesoUnitKg,p.pesoTotalKg,p.areaPinturaM2,p.feito,p.pendente,p.pct,p.situacao,p.totalMarca,p.preparadoMarca,p.pais,dataSyneco(p.data),p.observacao]:
    exp?[p.marca,p.descricao,p.frente,p.qte,p.feito,p.pendente,p.pct,p.situacao,p.baixa,p.romaneios,p.pesoTotalKg]:
    [p.marca,p.tipo,p.descricao||p.perfil,p.qte,p.feito,p.pendente,p.pct,p.situacao,p.pesoTotalKg,dataSyneco(p.data),p.observacao];
   adicionarLinhaTabela(sheet,r,valores);
   sheet.getCell(r,prep?13:7).numFmt='0.0%';
   if(!exp)sheet.getCell(r,prep?18:10).numFmt='dd/mm/yyyy hh:mm';
   for(const c of prep?[8,9,10]:exp?[11]:[9])sheet.getCell(r,c).numFmt='#,##0.00';
   sheet.getRow(r).height=Math.min(409,Math.max(34,...valores.map((v,c)=>typeof v==='string'?Math.ceil(v.length/(sheet.getColumn(c+1).width-3))*12+8:0)));
   sheet.getRow(r).eachCell(cell=>{cell.alignment={...cell.alignment,wrapText:true,vertical:'middle'};});
   if(p.cabecalhoConjunto)sheet.getRow(r).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'DCEAF3'}};cell.font={...cell.font,bold:true,color:{argb:'002945'}};});
   else if(p.pct===1)sheet.getCell(r,prep?14:8).fill={type:'pattern',pattern:'solid',fgColor:{argb:'E8F8E8'}};
  });
  if(!linhas.length){sheet.mergeCells(cab+1,1,cab+1,headers.length);sheet.getCell(cab+1,1).value=exp?'Nenhuma LE importada para esta OP. A LPC não substitui a lista de embarque.':'Nenhuma peça da LPC disponível para esta OP.';sheet.getRow(cab+1).height=30;}
  if(linhas.length)sheet.autoFilter={from:{row:cab,column:1},to:{row:cab+linhas.length,column:headers.length}};
  sheet.views=[{state:'frozen',ySplit:cab,xSplit:prep?2:1}];
  sheet.pageSetup={orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:`${cab}:${cab}`};
 }
 return workbook;
}
