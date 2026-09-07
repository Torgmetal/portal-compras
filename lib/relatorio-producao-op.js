import {normalizeSetorSyneco} from './syneco-dia';
import {numeroOpRelatorio} from './relatorio-producao-resumo';
import {ROTA_COMPOSTA,ROTA_SOLO,pecaEhComposta} from './prioridades-setor';
import {ehLinhaLixo} from './pecas-producao';

export const ETAPAS_PLANILHA_OP=['PREPARACAO','MONTAGEM','SOLDA','ACABAMENTO','JATO','PINTURA','EXPEDICAO'];
const marca=v=>String(v||'').trim().toUpperCase();
const num=v=>Math.max(0,Number(v)||0);
const ordena=(a,b)=>String(a.marca).localeCompare(String(b.marca),'pt-BR',{numeric:true});
const pertence=(r,op)=>r.opId?r.opId===op.id:numeroOpRelatorio(op.numero)!==null&&numeroOpRelatorio(r.opNumero||r.obra)===numeroOpRelatorio(op.numero);
const vigente=p=>!ehLinhaLixo(p)&&!['CANCELADA','CANCELADO'].includes(p.status);
const campos=p=>({id:p.id,marca:p.marca,descricao:p.descricao||'',material:p.material||'',perfil:p.perfil||'',comprimentoMm:p.comprimentoMm,pesoUnitKg:p.pesoUnitKg,pesoTotalKg:p.pesoTotalKg,areaPinturaM2:p.areaPinturaM2,observacao:p.observacao||'',qte:num(p.qte),tipo:p.tipoPeca==='CONJUNTO'?'Conjunto':p.tipoPeca==='CROQUI'?'Croqui':'Avulsa'});
function andamento(previsto,real,aplica=true){
 const feito=aplica?Math.min(previsto,num(real)):null;
 return {feito,pendente:feito==null?null:Math.max(0,previsto-feito),pct:feito==null||!previsto?null:feito/previsto,situacao:!aplica?'Não se aplica':!previsto?'Sem quantidade na lista':feito>=previsto?'Concluído':feito>0?'Parcial':'Sem apontamento'};
}

// Snapshot somente leitura. Quantidade do vínculo já é o TOTAL na LPC importada,
// não uma quantidade unitária a multiplicar novamente pela quantidade do conjunto.
export function detalharProducaoOp({op,pecas,ordens,listas=[],portal=[],pasta=[],baixas=[],sincronizadoEm=null}){
 const pcs=pecas.filter(p=>pertence(p,op)&&vigente(p));
 const lpc=pcs.filter(p=>p.naLPC||p.fonte==='LPC_IMPORT').sort(ordena);
 const real=new Map();
 for(const o of ordens){
  if(!pertence(o,op))continue;
  let setor=normalizeSetorSyneco(o.setor);if(setor==='CORTE')setor='PREPARACAO';
  const chave=marca(o.item)+'|'+setor,anterior=real.get(chave)||{qtd:0,data:null};
  anterior.qtd+=num(o.produzidoUn);
  if(num(o.produzidoUn)>0&&o.dataFim&&(!anterior.data||new Date(o.dataFim)>new Date(anterior.data)))anterior.data=o.dataFim;
  real.set(chave,anterior);
 }
 const apontado=(p,s)=>real.get(marca(p.marca)+'|'+s)||{qtd:0,data:null};
 const porId=new Map(lpc.map(p=>[p.id,p]));
 const pais=new Map();
 for(const c of lpc)for(const rel of c.conjuntoCroquis||[]){
  if(!porId.has(rel.croquiId))continue;
  const anteriores=pais.get(rel.croquiId)||[];anteriores.push(c.marca);pais.set(rel.croquiId,anteriores);
 }
 const preparacao=[];
 function linhaPrep(p,conjunto='',necessario=num(p.qte)){
  const ap=apontado(p,'PREPARACAO'),todos=pais.get(p.id)||[];
  const global=andamento(num(p.qte),ap.qtd);
  const compartilhado=!!conjunto&&todos.length>1;
  const atribuivel=!compartilhado||global.feito===0||global.feito>=num(p.qte);
  const feito=atribuivel?Math.min(necessario,global.feito):null;
  return {...campos(p),conjunto,qte:necessario,totalMarca:num(p.qte),preparadoMarca:global.feito,feito,
   pendente:feito==null?null:necessario-feito,pct:feito==null||!necessario?null:feito/necessario,
   situacao:!atribuivel?'Parcial na OP — vínculo não identificado':feito>=necessario?'Preparado':feito>0?'Parcial':'Sem apontamento',
   data:ap.data,compartilhado,pais:todos.join(', '),
   pesoTotalKg:num(p.qte)?num(p.pesoTotalKg)*necessario/num(p.qte):0,
   areaPinturaM2:num(p.qte)?num(p.areaPinturaM2)*necessario/num(p.qte):0};
 }
 for(const p of lpc.filter(p=>p.tipoPeca!=='CROQUI')){
  const vinculos=(p.conjuntoCroquis||[]).filter(r=>porId.has(r.croquiId));
  if(vinculos.length){
   preparacao.push({...campos(p),conjunto:p.marca,cabecalhoConjunto:true,situacao:'Composição abaixo'});
   for(const r of vinculos.sort((a,b)=>ordena(porId.get(a.croquiId),porId.get(b.croquiId))))preparacao.push(linhaPrep(porId.get(r.croquiId),p.marca,num(r.qtdNoConjunto)));
  }else preparacao.push(linhaPrep(p));
 }
 for(const p of lpc.filter(p=>p.tipoPeca==='CROQUI'&&!pais.has(p.id)))preparacao.push(linhaPrep(p));
 const setores={PREPARACAO:preparacao};
 for(const setor of ETAPAS_PLANILHA_OP.filter(s=>!['PREPARACAO','EXPEDICAO'].includes(s))){
  setores[setor]=lpc.filter(p=>p.tipoPeca!=='CROQUI').map(p=>{
   const composta=pecaEhComposta({...p,croquiCount:p.conjuntoCroquis?.length||0});
   const ap=apontado(p,setor),aplica=(composta?ROTA_COMPOSTA:ROTA_SOLO).includes(setor)||ap.qtd>0;
   return {...campos(p),...andamento(num(p.qte),ap.qtd,aplica),data:ap.data};
  });
 }
 // Expedição parte da LE. Croquis internos não viram carga; baixas sem romaneio
 // são informadas separadamente, nunca apresentadas como embarque comprovado.
 const le=new Map();
 for(const lista of listas.filter(l=>pertence(l,op)))for(const m of Array.isArray(lista.marcasJson)?lista.marcasJson:[]){
  if(ehLinhaLixo(m)||lpc.some(p=>marca(p.marca)===marca(m.marca)&&p.tipoPeca==='CROQUI'))continue;
  const k=marca(m.marca),anterior=le.get(k);
  if(anterior){anterior.frentes.push(lista.frente);anterior.duplicada=true;continue;}
  le.set(k,{marca:m.marca,descricao:m.descricao||'',qte:m.qte==null?null:num(m.qte),pesoTotalKg:num(m.pesoTotal),frentes:[lista.frente],arquivoExpedido:m.expedidoRomaneio===true||m.expedidoArquivo===true});
 }
 if(!le.size)for(const p of pcs.filter(p=>(p.naLE||p.fonte==='LE_IMPORT')&&p.tipoPeca!=='CROQUI'))le.set(marca(p.marca),{...campos(p),frentes:[]});
 const exp=new Map();
 const registrar=(m,q,fonte,ref)=>{const k=marca(m);if(!k)return;const e=exp.get(k)||{portal:0,pasta:0,baixa:0,refs:[]};e[fonte]+=num(q);if(ref)e.refs.push(ref);exp.set(k,e);};
 for(const r of portal.filter(r=>pertence(r,op)&&r.emitidoEm&&r.status!=='CANCELADO'))for(const i of Array.isArray(r.itens)?r.itens:[])registrar(i.marca,i.qte??i.qtd,'portal',`Portal ${r.numero}`);
 for(const r of pasta.filter(r=>r.opId===op.id))for(const i of r.itens||[])registrar(i.pecaConjunto?.marca,i.qtd,'pasta',`Romaneio ${r.numero}`);
 for(const b of baixas.filter(b=>b.opId===op.id))registrar(b.marca,b.qtd,'baixa',`Baixa: ${b.motivo}`);
 setores.EXPEDICAO=[...le.values()].sort(ordena).map(p=>{
  const e=exp.get(marca(p.marca))||{portal:0,pasta:0,baixa:0,refs:[]};
  const ambiguo=p.duplicada||(e.portal>0&&e.pasta>0);
  const semQtd=p.qte==null||ambiguo||(p.arquivoExpedido&&!e.portal&&!e.pasta);
  const a=semQtd?{feito:null,pendente:null,pct:null,situacao:ambiguo?'Conferir vínculos / fontes':'Quantidade expedida não comprovada'}:andamento(p.qte,e.portal+e.pasta);
  const situacao=semQtd?a.situacao:a.pct===1?'Expedido':a.feito>0?'Embarque parcial':'Sem embarque registrado';
  return {...p,...a,situacao,baixa:e.baixa,romaneios:[...new Set(e.refs)].join(', '),frente:p.frentes.join(', ')};
 });
 return {op:{id:op.id,numero:op.numero,obra:op.obra,cliente:op.cliente},setores,sincronizadoEm,geradoEm:new Date().toISOString(),semLE:!le.size};
}
