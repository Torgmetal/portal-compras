import {expect,it} from 'vitest';
import {criarPlanilhaFurosApontamento} from '@/lib/furos-apontamento-cliente';
it('exporta números identificáveis e diferença para conferir, sem instruir baixa automática',async()=>{
 const wb=await criarPlanilhaFurosApontamento([{op:'067',obraSyneco:'T67',opNumero:'T67DT',marca:'T67DT3',qte:1,setorUp:'Jato',valorUp:0,setor:'Pintura',valor:1,diff:1,observacao:'Conferir registros antes de lançar.'}]);
 const linhas=[];wb.worksheets[0].eachRow(r=>linhas.push(r.values.slice(1)));
 expect(linhas).toContainEqual(['OP Torg','Obra no Syneco','Fase / lista LPC','Marca','Qtd na LPC','Etapa anterior','Apontado anterior','Etapa adiante','Apontado adiante','Diferença a conferir','Orientação']);
 expect(linhas).toContainEqual(['067','T67','T67DT','T67DT3',1,'Jato',0,'Pintura',1,1,'Conferir registros antes de lançar.']);
 expect(JSON.stringify(linhas)).not.toContain('A baixar');
 expect((await wb.xlsx.writeBuffer()).byteLength).toBeGreaterThan(1000);
});
