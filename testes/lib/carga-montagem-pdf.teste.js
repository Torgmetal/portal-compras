import {it,expect} from 'vitest';
import {extractText} from 'unpdf';
import {gerarModeloCargaPDF} from '@/lib/carga/modelo-carga-pdf';
it('o PDF segue a sequência manual, mesmo quando difere da camada e do número do volume',async()=>{
 const itens=['a','b'].map((id,i)=>({id,volume:i+1,C:1000,L:100,A:100,x:i*2000,y:0,z:0,kg:100,camada:0,tipo:'PECA',alerta:'Conferir resistência da caixa inferior',membros:[{marca:id,kg:100,desc:'VIGA'}],rotacaoManual:{x:i*90,y:0,z:0}}));
 const {bytes}=await gerarModeloCargaPDF({op:{numero:'DEMO'},previo:{numero:1},carga:{montagemManual:true,veiculo:{nome:'Truck',C:8500,L:2450,alturaUtil:2600},itens,passos:['b','a'],peso:200,romaneio:[],madeira:{pecas:{}},verificacoes:[{texto:'Volume 2: confira o apoio.'}]}});
 const {text}=await extractText(bytes,{mergePages:false});
 expect(text.join(' ')).toContain('Conferir resistência da caixa inferior');
 expect(text.join(' ')).toContain('Distância da lateral direita:');
 const etapas=text.filter(p=>p.includes('05 / Passo'));
 expect(etapas).toHaveLength(2);expect(etapas[0]).toContain('Volume 02');expect(etapas[1]).toContain('Volume 01');expect(text.join(' ')).toContain('Volume 2: confira o apoio.');
});
