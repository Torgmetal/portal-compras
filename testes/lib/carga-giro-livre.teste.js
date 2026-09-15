import {it,expect} from 'vitest';
import {girarVolumeNoCentro,limitesRotacionados} from '@/lib/carga/montagem-manual';
it('gira em ângulo livre ao redor do centro sem deslocar o volume nem alterar seus membros',()=>{
 const u={id:'a',C:2400,L:500,A:700,x:1000,y:800,z:300,membros:[{marca:'A'}],girada:true,rotacaoManual:{x:15,y:0,z:0}};
 const d=limitesRotacionados(u).tamanho;const novo=girarVolumeNoCentro(u,{x:15,y:37,z:0}), dn=limitesRotacionados(novo).tamanho;
 for(const e of ['x','y','z'])expect(novo[e]+dn[e]/2).toBeCloseTo(u[e]+d[e]/2,2);
 expect(novo.rotacaoManual.y).toBe(37);expect(novo.membros).toBe(u.membros);expect(u.rotacaoManual.y).toBe(0);
});
