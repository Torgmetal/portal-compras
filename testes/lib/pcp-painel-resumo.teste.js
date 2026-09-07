import { describe, it, expect } from 'vitest';
import { resumoPainel } from '../../lib/pcp-painel-resumo';
describe('resumo de leitura do PCP', () => {
  it('não apresenta zero como resultado de uma fonte indisponível', () => {
    const r = resumoPainel(null, null);
    expect(r.atrasadas).toBeNull(); expect(r.indisponivelKg).toBeNull();
    expect(r.prioridades).toBeNull(); expect(r.programacoes).toBeNull();
    expect(r.etapas.every(e => e.kg === null)).toBe(true);
  });
  it('mantém saldo separado por etapa e prioriza prazo vencido sem inventar risco', () => {
    const r = resumoPainel({ops:[
      {opId:1, atrasoDias:0, alertas:[], setores:[{setor:'CORTE',pendenteKg:100},{setor:'SOLDA',pendenteKg:100}]},
      {opId:2, atrasoDias:3, alertas:[], setores:[{setor:'SOLDA',pendenteKg:20}]},
      {opId:3, atrasoDias:0, alertas:['SEM_LISTA'], setores:[]},
    ]});
    expect(r.atrasadas).toBe(1); expect(r.prioridades.map(o=>o.opId)).toEqual([2,3]);
    expect(r.etapas.find(e=>e.key==='CORTE').kg).toBe(100);
    expect(r.etapas.find(e=>e.key==='SOLDA').kg).toBe(120);
  });
  it('não estima capacidade ausente e separa material parcial de indisponível', () => {
    const r = resumoPainel({ops:[]}, {cargaMaquinas:[{maquina:'A',diasCarga:null},{maquina:'B',diasCarga:2}],carteira:{pendente:{porEstoque:[{statusEstoque:'PARCIAL',kg:100},{statusEstoque:'INDISPONIVEL',kg:30}]}}});
    expect(r.maiorCarga.maquina).toBe('B'); expect(r.indisponivelKg).toBe(30);
    expect(r.atrasadas).toBe(0);
  });
  it('ordena liberações por data com as sem data ao final, sem alterar a fonte', () => {
    const ops=[{opNumero:89,liberacoes:[{id:'a',dataProgramada:null},{id:'b',dataProgramada:'2026-09-09'},{id:'c',dataProgramada:'2026-09-08'}]}];
    expect(resumoPainel({ops}).programacoes.map(l=>l.id)).toEqual(['c','b','a']);
    expect(ops[0].liberacoes[0].id).toBe('a');
  });
});
