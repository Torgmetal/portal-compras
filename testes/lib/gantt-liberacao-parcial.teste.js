// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { criarPainelProjetos } from '@/app/pcp/producao/_gantt/painel-projetos';

it('seleciona aptos e distribui apenas eles, mantendo pendentes disponíveis para consulta',()=>{
 const raiz=document.createElement('div');
 raiz.innerHTML='<div id="gp-pCorpo"></div><div id="gp-pFoot"></div>';
 const r={setor:'MONTAGEM',recurso:null,itens:[
  {id:'c1',m:'C01',q:1,kg:10,prontidao:{pronto:true,total:1,cortados:1,motivo:'Apto'}},
  {id:'c2',m:'C02',q:1,kg:10,prontidao:{pronto:false,total:1,cortados:0,motivo:'0/1 croquis cortados'}},
 ]};
 const dep={raiz,$:id=>raiz.querySelector('#gp-'+id),nkg:String,dbr:String,pintarPainel:()=>painel.pintarProjetos(r)};
 const painel=criarPainelProjetos(dep);
 painel.pintarProjetos(r);
 const aptos=raiz.querySelector('#gp-selAptos');
 expect(aptos).not.toBeNull();
 aptos.click();
 expect([...painel.idsParaDividir(r)]).toEqual(['c1']);
 expect(raiz.textContent).toContain('0/1 croquis cortados');
 raiz.querySelector('#gp-selTodos').click();
 expect([...painel.idsParaDividir(r)]).toEqual(['c1']);
});
