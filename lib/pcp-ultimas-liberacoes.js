export const NOMES_SETORES_LIBERACAO={CORTE:'Preparação',MONTAGEM:'Montagem',SOLDA:'Solda',ACABAMENTO:'Acabamento',JATO:'Jato',PINTURA:'Pintura',EXPEDICAO:'Expedição'};

const ativas=(ops=[])=>ops.flatMap(op=>(op.liberacoes||[]).filter(l=>['LIBERADA','EM_PRODUCAO'].includes(l.status)).map(l=>({...l,opId:op.opId,opNumero:op.opNumero,obra:op.obra})))
 .sort((a,b)=>String(b.liberadoEm||'').localeCompare(String(a.liberadoEm||''))||String(a.id).localeCompare(String(b.id)));

/* ⚠⚠ O AVISO SAI QUANDO TUDO TEM DIA. Vitor (08/09/2026): "quando a Larissa liberar as peças o aviso
   deve sair, mas caso fique alguma peça você deve deixar no histórico o que está faltando ainda".
   O aviso cobra o AGENDAMENTO, que é o trabalho do PCP — está escrito nele mesmo: "o agendamento é
   feito aqui no PCP". Agendou tudo, sai da frente.

   ⚠ `semDia` indefinido = payload antigo (sem o cálculo do servidor): nesse caso a liberação
   continua no aviso. Sumir por falta de dado seria pior que sobrar. */
const pendente=(l)=>l.semDia==null?true:l.semDia>0;

/** O que ainda falta AGENDAR — é o que o aviso mostra. */
export function ultimasLiberacoesPcp(ops=[]){ return ativas(ops).filter(pendente); }

/* ⚠ O HISTÓRICO NÃO É LIXEIRA: guarda o que saiu do aviso E o que a fábrica ainda deve. Agendado
   não é feito — a liberação de 05/09 da OP-097 tinha as 31 peças com dia e 16 sem produzir. Some do
   aviso porque o PCP fez a parte dele; continua contando porque a peça ainda não existe. */
export function historicoLiberacoesPcp(ops=[]){ return ativas(ops).filter(l=>!pendente(l)); }
