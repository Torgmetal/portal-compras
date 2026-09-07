import {describe,it,expect} from 'vitest';
import {detalharProducaoOp} from '@/lib/relatorio-producao-op';
import {planilhaProducaoOp} from '@/lib/relatorio-producao-op-excel';
const op={id:'op1',numero:'097',cliente:'Cliente de teste',obra:'Obra de teste'};
const base={opId:op.id,opNumero:'097',fonte:'LPC_IMPORT',status:'PENDENTE',pesoUnitKg:10,pesoTotalKg:100,qte:10};
const pecas=[
 {...base,id:'c1',marca:'C1',tipoPeca:'CONJUNTO',qte:2,conjuntoCroquis:[{croquiId:'p1',qtdNoConjunto:4}]},
 {...base,id:'c2',marca:'C2',tipoPeca:'CONJUNTO',qte:3,conjuntoCroquis:[{croquiId:'p1',qtdNoConjunto:6}]},
 {...base,id:'p1',marca:'P1',tipoPeca:'CROQUI'},
 {...base,id:'a1',marca:'A1',tipoPeca:null},
];
const ordem=(item,setor,produzidoUn)=>({opId:op.id,item,setor,produzidoUn});
const monta=(args={})=>detalharProducaoOp({op,pecas,ordens:[],...args});
describe('planilha por OP',()=>{
 it('reproduz a composição e não multiplica outra vez as quantidades da LPC',()=>{
  const d=monta({ordens:[ordem('P1','Corte',6)]});
  const croquis=d.setores.PREPARACAO.filter(p=>p.marca==='P1');
  expect(croquis.map(p=>p.qte)).toEqual([4,6]);
  expect(croquis.map(p=>p.conjunto)).toEqual(['C1','C2']);
  expect(croquis.map(p=>p.preparadoMarca)).toEqual([6,6]);
  expect(croquis.every(p=>p.feito===null&&p.pct===null)).toBe(true);
  expect(croquis.reduce((s,p)=>s+p.pesoTotalKg,0)).toBe(100);
 });
 it('preparação completa permite confirmar todos os vínculos sem somar o global repetido',()=>{
  const d=monta({ordens:[ordem('P1','Corte',6),ordem('P1','Corte',4)]});
  expect(d.setores.PREPARACAO.filter(p=>p.marca==='P1').map(p=>p.feito)).toEqual([4,6]);
 });
 it('de montagem em diante exclui croquis e não inventa etapas anteriores ou de outra OP',()=>{
  const d=monta({ordens:[ordem('C1','Solda',1),{...ordem('C1','Montagem',2),opId:'outra'}]});
  expect(d.setores.SOLDA.map(p=>p.marca)).toEqual(['A1','C1','C2']);
  expect(d.setores.SOLDA.find(p=>p.marca==='C1').pct).toBe(.5);
  expect(d.setores.MONTAGEM.find(p=>p.marca==='C1').feito).toBe(0);
  expect(d.setores.MONTAGEM.find(p=>p.marca==='A1').situacao).toBe('Não se aplica');
 });
 it('usa LE na expedição e separa embarque parcial, baixas e romaneios cancelados',()=>{
  const d=monta({listas:[{opId:op.id,frente:'T97',marcasJson:[{marca:'C1',qte:5}]}],portal:[
   {opId:op.id,numero:1,emitidoEm:'2026-09-07',itens:[{marca:'C1',qte:3}]},
   {opId:op.id,numero:2,emitidoEm:'2026-09-07',status:'CANCELADO',itens:[{marca:'C1',qte:2}]},
  ],baixas:[{opId:op.id,marca:'C1',qtd:2,motivo:'NAO_ENCONTRADA'}]});
  expect(d.setores.EXPEDICAO[0]).toMatchObject({qte:5,feito:3,pendente:2,pct:.6,baixa:2});
  expect(monta().setores.EXPEDICAO).toEqual([]);
  expect(monta().semLE).toBe(true);
 });
 it('sinalização antiga e fontes duplicadas não viram quantidades inventadas',()=>{
  const d=monta({listas:[{opId:op.id,frente:'T97',marcasJson:[{marca:'C1',qte:5,expedidoArquivo:true}]}]});
  expect(d.setores.EXPEDICAO[0]).toMatchObject({feito:null,pct:null});
 });
 it('mantém linhas pertencentes às duas listas e exporta sete abas com percentuais numéricos',async()=>{
  const d=monta({pecas:pecas.map(p=>({...p,fonte:'LE_IMPORT',naLPC:true})),ordens:[ordem('C1','Solda',1)]});
  const wb=await planilhaProducaoOp(d);
  expect(wb.worksheets.map(w=>w.name)).toEqual(['Preparação','Montagem','Solda','Acabamento','Jato','Pintura','Expedição']);
  let row;wb.getWorksheet('Solda').eachRow(r=>{if(r.getCell(1).value==='C1')row=r;});
  expect(row.getCell(7).value).toBe(.5);expect(row.getCell(7).numFmt).toBe('0.0%');
  expect(wb.getWorksheet('Preparação').views[0].xSplit).toBe(2);
  expect((await wb.xlsx.writeBuffer()).byteLength).toBeGreaterThan(10000);
 });
});
