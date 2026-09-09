import { describe, it, expect } from 'vitest';
import { calcularItensComerciais, migrarItensComerciais } from '@/lib/lqc-itens-comerciais';
const catalogo = [
 {key:'TELHA_TERMO',rotulo:'Telha térmica',un:'m²',preco:125},
 {key:'TELHA_SIMPLES',rotulo:'Telha simples',un:'m²',preco:0},
 {key:'CHUMBADORES',rotulo:'Chumbadores químicos',un:'un',preco:0},
];
const soma = linhas => linhas.reduce((s,l)=>s+l.subtotal,0);
describe('itens comerciais de compra',()=>{
 it('soma quantidade e custo antes de preencher o nome, modelos e complementos sem margem',()=>{
  const c={comerciaisCompra:{versao:1,modelos:{Telhas:[{id:'t1',quantidade:10,custoUnitario:20},{id:'t2',quantidade:'2,5',custoUnitario:40}]},complementos:{Telhas:{laRocha:{quantidade:10,custoUnitario:4},frete:80}}}};
  const linhas=calcularItensComerciais(c,catalogo,new Set());
  expect(soma(linhas)).toBe(420);
  expect(linhas.filter(l=>l.tipo==='frete')).toHaveLength(1);
  expect(linhas.find(l=>l.tipo==='complemento')).toMatchObject({un:'m²',qtd:10,subtotal:40});
 });
 it('mantém custo, chaves distintas da mesma família e metadados após migrar/salvar/reabrir',()=>{
  const c={itensComerciais:{TELHA_TERMO:{qtd:2,codigoOmie:'0012',cor:'Azul',obs:'Manter'},TELHA_SIMPLES:{qtd:3,preco:50},CHUMBADORES:{qtd:4,preco:6}}};
  expect(soma(calcularItensComerciais(c,catalogo,new Set()))).toBe(424);
  const migrado=migrarItensComerciais(c,catalogo);
  expect(migrado.modelos.Telhas).toHaveLength(2);
  expect(migrado.modelos.Telhas[0]).toMatchObject({codigoOmie:'0012',cor:'Azul',especificacao:'Manter'});
  const salvo=JSON.parse(JSON.stringify({...c,comerciaisCompra:migrado}));
  const linhas=calcularItensComerciais(salvo,catalogo,new Set());
  expect(soma(linhas)).toBe(424);
  expect(linhas.map(l=>l.key)).toEqual(['TELHA_TERMO','TELHA_SIMPLES','CHUMBADORES']);
  expect(salvo.itensComerciais).toEqual(c.itensComerciais);
  expect(migrarItensComerciais(salvo,catalogo)).toEqual(migrado);
 });
 it('continua respeitando áreas ativas após migrar e não ressuscita quantidade global',()=>{
  const c={itensComerciais:{TELHA_TERMO:{qtd:99,preco:10,porArea:{A:2,B:7}}}};
  const salvo={...c,comerciaisCompra:migrarItensComerciais(c,catalogo)};
  expect(soma(calcularItensComerciais(salvo,catalogo,new Set(['A'])))).toBe(20);
  expect(soma(calcularItensComerciais(salvo,catalogo,new Set()))).toBe(0);
 });
 it('edição da composição migrada substitui o legado sem duplicá-lo e remoção explícita permanece vazia',()=>{
  const c={itensComerciais:{TELHA_TERMO:{qtd:2}}};
  const compra=migrarItensComerciais(c,catalogo);
  compra.modelos.Telhas[0].quantidade=3;
  expect(soma(calcularItensComerciais({...c,comerciaisCompra:compra},catalogo,new Set()))).toBe(375);
  compra.modelos.Telhas=[];
  expect(calcularItensComerciais({...c,comerciaisCompra:compra},catalogo,new Set())).toEqual([]);
 });
 it('frete e montagem de lanternim são valores únicos, sem multiplicação por modelos',()=>{
  const c={comerciaisCompra:{versao:1,modelos:{Lanternim:[{quantidade:2,custoUnitario:5},{quantidade:3,custoUnitario:10}]},complementos:{Lanternim:{frete:70,montagem:90}}}};
  expect(soma(calcularItensComerciais(c,catalogo,new Set()))).toBe(200);
 });
 it('normaliza milhares do legado, mas edição com ponto decimal mantém a precisão do input numérico',()=>{
  const c={itensComerciais:{TELHA_TERMO:{qtd:'1.234,5',preco:'2,50',porArea:{A:'1.200,5'}}}};
  const compra=migrarItensComerciais(c,catalogo);
  expect(compra.modelos.Telhas[0].porArea.A).toBe(1200.5);
  compra.modelos.Telhas[0].porArea={};
  compra.modelos.Telhas[0].quantidade='1.234';
  expect(soma(calcularItensComerciais({...c,comerciaisCompra:compra},catalogo,new Set()))).toBe(3.09);
 });
});
