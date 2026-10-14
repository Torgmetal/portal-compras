import { describe, it, expect } from 'vitest';
import { calcularItensComerciais, migrarItensComerciais, numeroCompra } from '@/lib/lqc-itens-comerciais';
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
 // ⚠⚠ Desde 16/09/2026 estes campos são CampoDecimal, que entrega o texto em português. A leitura
 // antiga trocava só a primeira vírgula: "15.000,00" virava "15.000.00", NaN, e o item zerava calado.
 it('texto do CampoDecimal com milhar não vira zero: "15.000,00" e "1.234,5"',()=>{
  expect(numeroCompra('15.000,00')).toBe(15000);
  expect(numeroCompra('1.234,5')).toBe(1234.5);
 });
 it('quantidade, custo, complemento, frete e montagem digitados com milhar entram na conta',()=>{
  const c={comerciaisCompra:{versao:1,
   modelos:{Telhas:[{id:'t1',quantidade:'1.234,5',custoUnitario:'2'}],Lanternim:[{id:'l1',quantidade:'2',custoUnitario:'1.505,64'}]},
   complementos:{Telhas:{laRocha:{quantidade:'1.000,5',custoUnitario:'2'},frete:'15.000,00'},Lanternim:{montagem:'1.200,00'}}}};
  const linha=key=>calcularItensComerciais(c,catalogo,new Set()).find(l=>l.key===key);
  expect(linha('TELHA_SIMPLES')).toMatchObject({qtd:1234.5,preco:2,subtotal:2469});
  expect(linha('LANTERNIM')).toMatchObject({qtd:2,preco:1505.64,subtotal:3011.28});
  expect(linha('COMP:TELHA_SIMPLES:laRocha')).toMatchObject({qtd:1000.5,preco:2,subtotal:2001});
  expect(linha('COMP:TELHA_SIMPLES:frete')).toMatchObject({qtd:1,subtotal:15000});
  expect(linha('COMP:LANTERNIM:montagem')).toMatchObject({qtd:1,subtotal:1200});
 });
 it('quantidade por área digitada com milhar acompanha as áreas ativas',()=>{
  const c={comerciaisCompra:{versao:1,modelos:{Telhas:[{id:'t1',porArea:{A:'1.234,5',B:'2.000,25'},custoUnitario:'2'}]}}};
  expect(soma(calcularItensComerciais(c,catalogo,new Set(['A'])))).toBe(2469);
 });
 it('item migrado do legado e editado com milhar também é lido',()=>{
  const c={itensComerciais:{TELHA_TERMO:{qtd:2,preco:'2,50'}}};
  const compra=migrarItensComerciais(c,catalogo);
  compra.modelos.Telhas[0].quantidade='1.234,5';
  compra.modelos.Telhas[0].custoUnitario='1.000,00';
  expect(soma(calcularItensComerciais({...c,comerciaisCompra:compra},catalogo,new Set()))).toBe(1234500);
 });
 // ⚠ Caracterização, não correção: o que a leitura antiga já entendia segue igual. É o ponto decimal
 // do input numérico de antes de 16/09/2026 — o numeroBR leria "0.125" como 125.
 it('ponto sem vírgula continua decimal, como gravava o input numérico',()=>{
  expect(numeroCompra('0.125')).toBe(0.125);
  expect(numeroCompra('1.234')).toBe(1.234);
  expect(numeroCompra('2,5')).toBe(2.5);
  const c={comerciaisCompra:{versao:1,modelos:{Telhas:[{id:'t1',quantidade:'0.125',custoUnitario:'8'}]}}};
  expect(soma(calcularItensComerciais(c,catalogo,new Set()))).toBe(1);
 });
});
