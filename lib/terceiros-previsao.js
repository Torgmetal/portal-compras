import {saldosTerceiro,opTerceiro} from './terceiros-retorno';
// Previsão de chegada não é ocupação de bancada, nem baixa de produção.
/* ⚠⚠ UM BLOCO POR DESTINO, NÃO POR MARCA. Vitor (09/09/2026): "o jato deve estar com algum
   problema, ele está ficando em aberto, uma página enorme". E estava: a previsão emitia um lote
   para CADA marca, e o romaneio da OP-097 tem 65 marcas voltando no mesmo dia para o jato — 65
   blocos empilhados numa coluna só, 149 dos 213 lotes do quadro inteiro (74 mais na expedição).

   O quadro agrupa por setor+recurso+OP+dia em todo lugar (ver `juntar` em lib/gantt-pcp); a
   previsão passava por fora desse agrupamento porque é concatenada no fim. Agora ela entrega o
   mesmo formato: um lote por (romaneio, destino, dia) com as marcas dentro de `itens`, que é de
   onde a lista de projetos já lê.

   ⚠ O RECEBIDO CONTINUA UM POR ITEM (ver abaixo): aquele é ARRASTÁVEL — é assim que se programa o
   retorno —, e juntar tiraria a possibilidade de mandar cada lote para um dia. A previsão não se
   arrasta (clicar leva a /pcp/terceirizados), então não há o que separar. */
export function previsoesTerceiro(romaneios){
 return romaneios.filter(r=>['ENVIADO','PARCIAL'].includes(r.status)&&/^\d+$/.test(opTerceiro(r.opRefNumero))&&r.dataPrevRetorno)
 .flatMap(r=>{
  const dia=new Date(r.dataPrevRetorno).toISOString().slice(0,10);
  const porDestino=new Map();
  for(const i of saldosTerceiro(r).filter(i=>i.saldo>0&&i.destino)){
   const g=porDestino.get(i.destino)||[];g.push(i);porDestino.set(i.destino,g);
  }
  return [...porDestino.entries()].map(([destino,itens])=>{
   const id=`previsao:${r.id}:${destino}`;
   return {
    id,setor:destino,recurso:null,dia,op:opTerceiro(r.opRefNumero).padStart(3,"0"),
    obra:`RT-${r.numero} · aguardando terceiro`,terceiroPrevisto:true,
    pecas:itens.reduce((t,i)=>t+i.saldo,0),
    kg:Math.round(itens.reduce((t,i)=>t+i.saldo*i.pesoUn,0)),
    custo:0,feitas:0,adiado:0,
    // ⚠ o id do ITEM continua único por marca: a lista de projetos usa isso como chave de linha
    itens:itens.map((i,n)=>({id:`${id}:${n}`,m:i.marca,q:i.saldo,kg:Math.round(i.saldo*i.pesoUn),c:0})),
   };
  });
 });
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
