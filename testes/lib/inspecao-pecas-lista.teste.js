import {it,expect} from 'vitest';
import {pecasDoRelatorio,quantidadesPorMarca} from '@/lib/inspecao-pecas';
it('prioriza ajuste salvo, depois snapshot da lista, depois lista atual',()=>{
 const rel={marcas:['P1','p2','P3','P4'],resultados:{pecasInformadas:[{marca:'P1',quantidade:2}],qtdPeca:{P1:10,P2:12}}};
 expect(pecasDoRelatorio(rel,{P1:20,P2:24,P3:30})).toEqual([{marca:'P1',quantidade:2},{marca:'p2',quantidade:12},{marca:'P3',quantidade:30},{marca:'P4',quantidade:''}]);
});
it('soma ocorrências da marca nas frentes e ignora quantidades inválidas',()=>{
 expect(quantidadesPorMarca([{marca:' p1 ',qte:5},{marca:'P1',qte:7},{marca:'P2',qte:0},{marca:'P3',qte:-1}])).toEqual({P1:12});
});
