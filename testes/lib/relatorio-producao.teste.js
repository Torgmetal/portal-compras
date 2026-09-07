import {describe,it,expect} from 'vitest';
import {resumirProducao,numeroOpRelatorio,SETORES_RELATORIO} from '@/lib/relatorio-producao-resumo';
import {planilhaStatusProducao} from '@/lib/relatorio-producao-excel';
const op={id:'op1',numero:'097',cliente:'Cliente de teste',obra:'Obra de teste',status:'ABERTA'};
const p={opId:'op1',marca:'M1',qte:10,pesoTotalKg:100,descricao:'Viga W200',tipoPeca:'CONJUNTO',_count:{conjuntoCroquis:1},status:'PINTURA'};
const ordem=(setor,q,item='M1')=>({opId:'op1',item,setor,produzidoUn:q});
describe('avanço real da LPC',()=>{
 it('não considera a posição da peça como execução dos setores anteriores',()=>{const [o]=resumirProducao([op],[p],[ordem('Pintura',5)]);expect(o.setores.PINTURA.pct).toBe(50);expect(o.setores.SOLDA.pct).toBe(0);expect(o.pctGeral).toBe(10);expect(o.concluida).toBe(false)});
 it('inclui peças ainda não programadas no denominador e limita excesso por marca',()=>{const [o]=resumirProducao([op],[p,{...p,marca:'M2'}],[ordem('Montagem',25)]);expect(o.setores.MONTAGEM.pct).toBe(50);expect(o.setores.MONTAGEM.feitoUn).toBe(10)});
 it('conta croquis no corte e respeita rota de avulsas',()=>{const [o]=resumirProducao([op],[{...p,tipoPeca:'CROQUI'},{...p,marca:'A1',tipoPeca:null}],[ordem('Serra',5)]);expect(o.setores.CORTE.pct).toBe(25);expect(o.setores.MONTAGEM.pct).toBeNull();expect(o.setores.PINTURA.totalUn).toBe(10)});
 it('não mistura marcas de OPs diferentes, mas reconhece vínculo legado exato da OP',()=>{const ops=[op,{...op,id:'op2',numero:'098'}];const [o]=resumirProducao(ops,[p],[{opId:'op2',item:'M1',setor:'Solda',produzidoUn:10},{opId:null,obra:'T97A',item:'M1',setor:'Montagem',produzidoUn:3}]);expect(o.setores.SOLDA.pct).toBe(0);expect(o.setores.MONTAGEM.pct).toBe(30);expect(numeroOpRelatorio('OP-097')).toBe('97')});
 it('marca conclusão só com todas as etapas cumpridas e exclui OP encerrada',()=>{const ordens=SETORES_RELATORIO.map(s=>ordem(s,10));expect(resumirProducao([op],[p],ordens)[0].concluida).toBe(true);expect(resumirProducao([{...op,status:'ENCERRADA'}],[p],ordens)).toEqual([])});
 it('exporta números percentuais e todas as colunas, com detalhe e critérios',async()=>{const ops=resumirProducao([op],[p],[ordem('Pintura',5)]);const wb=await planilhaStatusProducao({ops,sincronizadoEm:'2026-09-07T15:00:00Z'});expect(wb.worksheets.map(s=>s.name)).toEqual(['Status por OP','Detalhe dos setores','Critérios']);const sheet=wb.worksheets[0];let linha;sheet.eachRow((r)=>{if(r.getCell(1).value==='097')linha=r});expect(linha.getCell(4).value).toBe(.1);expect(linha.getCell(10).value).toBe(.5);expect(linha.getCell(4).numFmt).toBe('0.0%');const buf=await wb.xlsx.writeBuffer();expect(buf.byteLength).toBeGreaterThan(4000);});
});
