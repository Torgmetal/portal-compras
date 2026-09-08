import {it,expect} from 'vitest';
import {limitesTolerancia,foraDaTolerancia} from '@/lib/tolerancia-inspecao';
it('interpreta tolerâncias editadas, inclusive decimais e zero',()=>{
 expect(limitesTolerancia('± 5')).toEqual({min:-5,max:5});
 expect(limitesTolerancia('0,5 mm')).toEqual({min:-.5,max:.5});
 expect(limitesTolerancia('+/- 0.125')).toEqual({min:-.125,max:.125});
 expect(limitesTolerancia('± 0')).toEqual({min:0,max:0});
});
it('respeita a tolerância da cota em vez de um limite fixo de três',()=>{
 expect(foraDaTolerancia({projetoMm:100,encontradoMm:104,tolerancia:'± 5'})).toBe(false);
 expect(foraDaTolerancia({projetoMm:100,encontradoMm:102,tolerancia:'± 1'})).toBe(true);
 expect(foraDaTolerancia({projetoMm:100,encontradoMm:105,tolerancia:'± 5'})).toBe(false);
});
it('interpreta limites assimétricos sem juntar os números',()=>{
 expect(limitesTolerancia('+5 / -2')).toEqual({min:-2,max:5});
 expect(foraDaTolerancia({projetoMm:100,encontradoMm:97,tolerancia:'+5/-2'})).toBe(true);
});
it('não inventa limites para campos vazios ou referências em texto',()=>{
 for(const v of ['',null,'conforme projeto','±','-3','± 3abc'])expect(limitesTolerancia(v)).toBe(null);
 expect(foraDaTolerancia({projetoMm:100,encontradoMm:null,tolerancia:'± 3'})).toBe(null);
});
