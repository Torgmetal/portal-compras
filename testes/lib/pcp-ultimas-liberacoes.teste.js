import {describe,it,expect} from 'vitest';
import {ultimasLiberacoesPcp} from '@/lib/pcp-ultimas-liberacoes';
describe('avisos de liberação no PCP',()=>{
 it('mostra a nova liberação sem data antes das antigas, com OP, setor e quantidade',()=>{
  const ops=[{opId:'a',opNumero:'097',liberacoes:[{id:'antiga',status:'LIBERADA',liberadoEm:'2026-09-01',dataProgramada:'2026-09-10',setores:['CORTE']},{id:'nova',status:'LIBERADA',liberadoEm:'2026-09-08',dataProgramada:null,setores:['MONTAGEM'],totalPecas:12}]},{opId:'b',opNumero:'098',liberacoes:[{id:'outra',status:'EM_PRODUCAO',liberadoEm:'2026-09-07',setores:['SOLDA']}]}];
  const r=ultimasLiberacoesPcp(ops);expect(r.map(l=>l.id)).toEqual(['nova','outra','antiga']);expect(r[0]).toMatchObject({opId:'a',opNumero:'097',setores:['MONTAGEM'],totalPecas:12,dataProgramada:null});expect(ops[0].liberacoes[0].id).toBe('antiga');
 });
 it('não anuncia liberações canceladas ou concluídas',()=>{expect(ultimasLiberacoesPcp([{liberacoes:[{status:'CANCELADA'},{status:'CONCLUIDA'}]}])).toEqual([]);expect(ultimasLiberacoesPcp()).toEqual([])});
});
