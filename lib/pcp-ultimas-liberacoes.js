export const NOMES_SETORES_LIBERACAO={CORTE:'Preparação',MONTAGEM:'Montagem',SOLDA:'Solda',ACABAMENTO:'Acabamento',JATO:'Jato',PINTURA:'Pintura',EXPEDICAO:'Expedição'};
export function ultimasLiberacoesPcp(ops=[]){
 return ops.flatMap(op=>(op.liberacoes||[]).filter(l=>['LIBERADA','EM_PRODUCAO'].includes(l.status)).map(l=>({...l,opId:op.opId,opNumero:op.opNumero,obra:op.obra})))
  .sort((a,b)=>String(b.liberadoEm||'').localeCompare(String(a.liberadoEm||''))||String(a.id).localeCompare(String(b.id)));
}
