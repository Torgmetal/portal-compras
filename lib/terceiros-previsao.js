import {saldosTerceiro,opTerceiro} from './terceiros-retorno';
// Previsão de chegada não é ocupação de bancada, nem baixa de produção.
export function previsoesTerceiro(romaneios){
 return romaneios.filter(r=>['ENVIADO','PARCIAL'].includes(r.status)&&/^\d+$/.test(opTerceiro(r.opRefNumero))&&r.dataPrevRetorno)
 .flatMap(r=>saldosTerceiro(r).filter(i=>i.saldo>0&&i.destino&&i.destino!=='EXPEDICAO').map((i,index)=>({
  id:`previsao:${r.id}:${index}`,setor:i.destino,recurso:null,dia:new Date(r.dataPrevRetorno).toISOString().slice(0,10),op:opTerceiro(r.opRefNumero).padStart(3,"0"),
  obra:`RT-${r.numero} · aguardando terceiro`,terceiroPrevisto:true,pecas:i.saldo,kg:Math.round(i.saldo*i.pesoUn),custo:0,feitas:0,adiado:0,
  itens:[{id:`previsao:${r.id}:${index}`,m:i.marca,q:i.saldo,kg:Math.round(i.saldo*i.pesoUn),c:0}],
 })));
}
// Cada retorno mantém sua própria quantidade e destino, inclusive quando uma marca volta em lotes.
export function lotesRecebidosTerceiro(romaneios,hoje,feito=()=>0){
 return romaneios.filter(r=>r.status!=='CANCELADO'&&/^\d+$/.test(opTerceiro(r.opRefNumero))).flatMap(r=>(r.retornos||[]).flatMap(ret=>(ret.itens||[]).flatMap((i,index)=>{
  if(!i.destino||i.destino==='EXPEDICAO'||!i.qte||i.producaoInicio==null)return [];
  const feitas=Math.min(i.qte,Math.max(0,feito(r,i)-(i.producaoInicio||0)));
  if(feitas>=i.qte)return [];
  const id=`retorno:${r.id}:${ret.id}:${index}`;
  return [{id,setor:i.destino,recurso:i.programacao?.recurso||null,dia:i.programacao?.dia||hoje,op:opTerceiro(r.opRefNumero).padStart(3,"0"),
   obra:`RT-${r.numero} · retorno recebido`,terceiroRecebido:true,pecas:i.qte,kg:Math.round(i.pesoTotal||0),custo:0,feitas,adiado:0,
   itens:[{id,m:i.marca,q:i.qte,kg:Math.round(i.pesoTotal||0),c:0,f:feitas}]}];
 })));
}
