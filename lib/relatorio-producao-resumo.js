import { normalizeSetorSyneco } from './syneco-dia';
import { ROTA_SOLO, ROTA_COMPOSTA, pecaEhCroqui, pecaEhComposta } from './prioridades-setor';
import { ehItemComprado } from './item-comprado';
import { ehLinhaLixo } from './pecas-producao';

export const SETORES_RELATORIO = ['CORTE','MONTAGEM','SOLDA','ACABAMENTO','JATO','PINTURA'];
export const numeroOpRelatorio = v => {const m=String(v||'').trim().match(/^(?:OP[-\s]*|T)?0*(\d+)(?:[A-Za-z].*)?$/i);return m?String(Number(m[1])):null;};
const marca=v=>String(v||'').trim().toUpperCase();
const positivo=v=>Math.max(0,Number(v)||0);

// Progresso físico por etapa da LPC: somente o apontamento do próprio setor.
// O geral pondera o peso que precisa passar em cada etapa, não soma peças de setores diferentes.
export function resumirProducao(ops, pecas, ordens) {
 const porId=new Map(ops.map(o=>[o.id,o]));
 const porNumero=new Map(ops.map(o=>[numeroOpRelatorio(o.numero),o]).filter(([numero])=>numero!==null));
 const real=new Map();
 const vincular=o=>o.opId?porId.get(o.opId):porNumero.get(numeroOpRelatorio(o.obra||o.opNumero));
 for(const o of ordens){const op=vincular(o),setor=normalizeSetorSyneco(o.setor)==='PREPARACAO'?'CORTE':normalizeSetorSyneco(o.setor);if(!op||!SETORES_RELATORIO.includes(setor))continue;const k=op.id+'|'+marca(o.item)+'|'+setor;real.set(k,(real.get(k)||0)+positivo(o.produzidoUn));}
 const grupos=new Map();
 for(const p of pecas){const op=vincular(p);if(!op||['ENCERRADA','CANCELADA'].includes(op.status)||ehLinhaLixo(p)||ehItemComprado(p)||['CANCELADA','CANCELADO'].includes(p.status))continue;
  if(!grupos.has(op.id))grupos.set(op.id,{opId:op.id,numero:op.numero,obra:op.obra,cliente:op.cliente,setores:Object.fromEntries(SETORES_RELATORIO.map(s=>[s,{setor:s,totalUn:0,feitoUn:0,totalKg:0,feitoKg:0,marcas:0,semPeso:false}]))});
  const linha=grupos.get(op.id),q=positivo(p.qte);if(!q)continue;
  const tipo={...p,croquiCount:p._count?.conjuntoCroquis||p.croquiCount||0};
  const rota=pecaEhCroqui(tipo)?['CORTE']:pecaEhComposta(tipo)?ROTA_COMPOSTA:ROTA_SOLO;
  for(const setor of SETORES_RELATORIO){const apontado=real.get(op.id+'|'+marca(p.marca)+'|'+setor)||0;
   // Operação explicitamente registrada também conta nas exceções à rota padrão.
   if(!rota.includes(setor)&&!apontado)continue;
   const s=linha.setores[setor],feito=Math.min(q,apontado),peso=positivo(p.pesoTotalKg);
   if(!peso)s.semPeso=true;s.totalUn+=q;s.feitoUn+=feito;s.totalKg+=peso;s.feitoKg+=peso*feito/q;s.marcas++;
  }
 }
 return [...grupos.values()].map(o=>{let total=0,feito=0,un=0,fu=0;let completo=true;const semPeso=Object.values(o.setores).some(s=>s.semPeso);
  for(const s of Object.values(o.setores)){s.pct=s.totalUn?!s.semPeso&&s.totalKg>0?100*s.feitoKg/s.totalKg:100*s.feitoUn/s.totalUn:null;s.situacao=s.pct==null?'Não se aplica':s.feitoUn>=s.totalUn?'Concluído':s.feitoUn>0?'Em execução':'Não iniciado';if(s.totalUn&&s.feitoUn<s.totalUn)completo=false;total+=s.totalKg;feito+=s.feitoKg;un+=s.totalUn;fu+=s.feitoUn;}
  return {...o,pctGeral:!semPeso&&total>0?100*feito/total:un>0?100*fu/un:null,concluida:un>0&&completo,base:!semPeso&&total>0?'Peso por etapa da LPC':'Unidades por etapa (LPC sem peso)'};
 }).sort((a,b)=>Number(b.numero)-Number(a.numero));
}
