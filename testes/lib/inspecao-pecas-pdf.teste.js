import {it,expect} from 'vitest';
import {extractText} from 'unpdf';
import {gerarPinturaPDF} from '@/lib/relatorio-pintura-pdf';
import {pecasDoRelatorio} from '@/lib/inspecao-pecas';
it('mantém quantidades desconhecidas em branco',()=>{expect(pecasDoRelatorio({marcas:['P1'],resultados:{quantidade:'34'}})).toEqual([{marca:'P1',quantidade:''}]);});
it('imprime todas as marcas com suas quantidades no anexo',async()=>{
 const pecasInformadas=Array.from({length:34},(_,i)=>({marca:`71444170-P${i+1}`,quantidade:i+1}));
 const pdf=await gerarPinturaPDF({rel:{codigo:'RIP-106-001',opNumero:'106',marcas:pecasInformadas.map(p=>p.marca),resultados:{pecasInformadas,quantidade:'595'},linhas:[],equipamentos:[]}});
 const {text}=await extractText(new Uint8Array(pdf),{mergePages:true});
 for(const p of pecasInformadas) expect(text).toContain(`${p.marca} (${p.quantidade} un.)`);
 expect(text).toContain('595');
});
