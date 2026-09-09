import { describe, it, expect } from 'vitest';
import { calcularLqc, custoCamada, atualizarDemao, CLASSES, precoPinturaPorDemaos, usarConsumoDaDemao } from '@/lib/lqc';

const areas = [
  { id: 'a', item:'1.1', area:'Galpão', estrutura:'COBERTURA', estruturaTipoId:'cliente-pipe', estruturaNome:'Pipe rack do cliente', pesoTotal:1000, areaM2:100, cor:'Azul', classificacao:'MÉDIO' },
  { id: 'b', item:'1.2', area:'Passarela', estrutura:'GUARDA CORPO', pesoTotal:500, areaM2:50, cor:'Amarelo', classificacao:'MÉDIO' },
  { id: 'c', item:'1.3', area:'Galpão', estrutura:'COBERTURA', pesoTotal:200, areaM2:20, cor:'Azul', classificacao:'MÉDIO' },
];
const camada = (patch={}) => ({ id:'t', camada:'PRIMER', solidos:60, peliculaSeca:60, precoLitro:30, perda:20, estruturaEscopo:'todas', ...patch });
const calcular = tintas => calcularLqc({ resumos:areas, tintas, faturamento:{tintas:'TORG'} });
const camadas = r => r.grupos.tintas.linhas.flatMap(g=>g.camadas||[]);

describe('pintura por destino com perda individual',()=>{
 it('soma quatro demãos, inclusive duas intermediárias, sem duplicar peso',()=>{
   const tintas = ['PRIMER','INTERMEDIÁRIO','INTERMEDIÁRIO','ACABAMENTO'].map((etapa,i)=>camada({id:String(i),camada:etapa,perda:10+i*10,cor:'Azul'}));
   const r=calcular(tintas);
   expect(camadas(r)).toHaveLength(4);
   expect(camadas(r).map(t=>t.areaM2)).toEqual([170,170,170,120]);
   expect(r.grupos.tintas.total.pesoKg).toBe(1700);
   expect(r.grupos.tintas.total.subtotal).toBeCloseTo(tintas.reduce((s,t,i)=>s+custoCamada(t,i===3?120:170).total,0),2);
   expect(r.demaos).toBe(4);
   expect(r.grupos.pintura.total.subtotal).toBeGreaterThan(0);
 });
 it('seleciona tipo personalizado e área por identidade, mesmo com nome de área repetido',()=>{
   const r=calcular([camada({estruturaEscopo:'cliente-pipe'}),camada({id:'t2',areaEscopo:'c'})]);
   expect(camadas(r).map(t=>t.areaM2)).toEqual([100,20]);
   expect(r.pinturaPorArea.map(a=>a.camadas.length)).toEqual([1,0,1]);
 });
 it('destino removido nunca amplia para a obra toda, mesmo com área manual',()=>{
   const r=calcular([camada({estruturaEscopo:'removido',areaM2:1000})]);
   expect(camadas(r)[0].litros).toBe(0);
   expect(r.grupos.tintas.total.subtotal).toBe(0);
 });
 it('acabamento exige cor definida e compatível; estrutura sem tipo continua elegível em todas',()=>{
   const r=calcularLqc({resumos:[{...areas[0],estrutura:null,estruturaTipoId:null,cor:''}],tintas:[camada(),camada({id:'acab',camada:'ACABAMENTO',cor:''})]});
   expect(camadas(r).map(t=>t.areaM2)).toEqual([100,0]);
 });
 it('área manual rateia entre destinos e soma exatamente consumo e custo das demãos',()=>{
   const r=calcular([camada({areaM2:234.56, precoDiluente:9})]);
   expect(r.pinturaPorArea.reduce((s,a)=>s+a.custo,0)).toBeCloseTo(r.grupos.tintas.total.subtotal,2);
   expect(r.pinturaPorArea.reduce((s,a)=>s+a.litros,0)).toBeCloseTo(camadas(r)[0].litros,2);
 });
 it('mão de obra acompanha número de demãos de cada destino sem cobrar a máxima na obra inteira',()=>{
   const tintas=[camada(),...Array.from({length:3},(_,i)=>camada({id:`extra-${i}`,estruturaEscopo:'cliente-pipe'}))];
   const cl=CLASSES.find(c=>c.nome.toUpperCase()==='MÉDIO');
   const r=calcular(tintas);
   expect(r.grupos.pintura.total.subtotal).toBeCloseTo(1000*precoPinturaPorDemaos(cl.demaos[0],4)+700*cl.demaos[0],2);
 });
 it('troca custo histórico por consumo para o grupo inteiro sem perder demãos ou atingir demãos novas',()=>{
   const antigas=[{camada:'PRIMER',perda:45,precoKg:2,solidos:60,peliculaSeca:60,precoLitro:30},{camada:'ACABAMENTO',perda:45,precoKg:2,cor:'Azul',solidos:60,peliculaSeca:60,precoLitro:30}];
   for(const tintas of [antigas,atualizarDemao(antigas,0,{perda:30})]) {
     const outra=camada({id:'nova',perda:45});
     const convertido=usarConsumoDaDemao([...tintas,outra],1);
     expect(convertido).toHaveLength(3);
     expect(convertido.slice(0,2).map(t=>t.precoKg)).toEqual([null,null]);
     expect(convertido[2]).toEqual(outra);
     expect(tintas[0].precoKg).toBe(2);
     const resultado=calcular(convertido);
     const esperado=convertido.slice(0,2).reduce((v,t)=>v+custoCamada(t,120).total,0)+custoCamada(outra,170).total;
     expect(resultado.grupos.tintas.total.subtotal).toBeCloseTo(esperado,2);
   }
 });
 it('editar perda de grupo histórico mantém o custo fechado uma única vez',()=>{
   const antigas=[{camada:'PRIMER',perda:45,precoKg:2,solidos:60,peliculaSeca:60,precoLitro:30},{camada:'ACABAMENTO',perda:45,cor:'Azul',solidos:60,peliculaSeca:60,precoLitro:30}];
   const editadas=atualizarDemao(antigas,0,{perda:30});
   expect(editadas[1].perda).toBe(45);
   expect(calcular(editadas).grupos.tintas.total.subtotal).toBe(calcular(antigas).grupos.tintas.total.subtotal);
   const r=calcular([...editadas,camada()]);
   expect(r.grupos.tintas.total.subtotal).toBeCloseTo(2400+custoCamada(camada(),170).total,2);
   expect(r.pinturaPorArea.reduce((s,a)=>s+a.custo,0)).toBeCloseTo(r.grupos.tintas.total.subtotal,2);
 });
 it('uma demão nova convive com custo histórico fechado sem multiplicá-lo',()=>{
   const antiga={camada:'PRIMER',perda:45,precoKg:2,solidos:60,peliculaSeca:60,precoLitro:30};
   const legado=calcular([antiga]);
   const misto=calcular([antiga,camada()]);
   expect(misto.grupos.tintas.total.subtotal).toBeCloseTo(legado.grupos.tintas.total.subtotal+custoCamada(camada(),170).total,2);
   expect(misto.grupos.tintas.total.pesoKg).toBe(1700);
 });
});
