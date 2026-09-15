import {it,expect} from 'vitest';
import * as THREE from 'three';
import {montarUnidade} from '@/lib/carga/cena-carga';
import {ajustarVolume} from '@/lib/carga/montagem-manual';
it('a malha desenhada usa os mesmos limites e deslocamento salvos, inclusive ao inclinar',()=>{
 for(const girada of [false,true])for(const r of [{x:90,y:0,z:0},{x:20,y:35,z:10}]){
  const u=ajustarVolume({id:'v',volume:1,tipo:'PECA',C:2000,L:300,A:500,girada,membros:[{marca:'a',C:2000,L:300,A:500}]},{x:125,y:85,z:250,rotacao:r});
  const g=montarUnidade(u,{}),box=new THREE.Box3().setFromObject(g),tam=box.getSize(new THREE.Vector3());
  expect(box.min.x*1000).toBeCloseTo(u.x,2);expect(box.min.y*1000).toBeCloseTo(u.y,2);expect(box.min.z*1000).toBeCloseTo(u.z,2);
  expect(tam.x*1000).toBeCloseTo(u.fx,2);expect(tam.y*1000).toBeCloseTo(u.fy,2);expect(tam.z*1000).toBeCloseTo(u.fz,2);
 }
});
