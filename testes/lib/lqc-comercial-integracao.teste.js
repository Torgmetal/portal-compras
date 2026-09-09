import {describe,it,expect} from 'vitest';
import {calcularLqc,calcularMontagem} from '@/lib/lqc';
const comerciaisCompra={versao:1,modelos:{Telhas:[{id:'a',nome:'Telha A',unidade:'m²',quantidade:10,custoUnitario:50},{id:'b',nome:'Telha B',unidade:'m²',quantidade:20,custoUnitario:100}]},complementos:{Telhas:{frete:100}},legados:[]};
describe('comercial integrado ao orçamento',()=>{
 it('cobra BDI uma vez sobre produtos e frete novos, sem margem comercial extra',()=>{
 const r=calcularLqc({comerciaisCompra,bdi:{administracao:10},faturamento:{itensComerciais:'TORG'}});
 expect(r.totais.comerciais).toBe(2600);expect(r.comerciais.margem).toBe(0);expect(r.bdiValor).toBe(260);expect(r.preco).toBe(2860);expect(r.comerciais.precoComMargem).toBe(2860);
 const direto=calcularLqc({comerciaisCompra,bdi:{administracao:10},faturamento:{itensComerciais:'DIRETO'}});
 expect(direto.bdiValor).toBe(0);expect(direto.preco).toBe(2600);
 });
 it('distingue mão de obra por modelo e não reaplica montagem a fretes/acessórios',()=>{
 const r=calcularMontagem({ativo:true,porItem:{a:10,b:20,TELHA_SIMPLES:99,frete:100}}, {comerciais:[{id:'a',key:'TELHA_SIMPLES',qtd:10},{id:'b',key:'TELHA_SIMPLES',qtd:20},{id:'frete',key:'frete',qtd:1,tipo:'frete'}]});
 expect(r.linhas.map(x=>x.key)).toEqual(['a','b']);expect(r.mdo).toBe(500);
 });
});
