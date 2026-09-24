import {it,expect} from 'vitest';
import {planejarCalcos} from '@/lib/carga/calcos-contato';
const face=(x0,x1,z0,z1,y)=>[[x0,z0,x1,z0,x1,z1,y],[x0,z0,x1,z1,x0,z1,y]];
const p=(id,y,faces)=>({id,tipo:'PECA',x:0,z:0,y,C:2000,L:1000,A:200,facesApoio:faces});
const inferior=p('base',0,[...face(0,2000,0,250,200),...face(0,2000,750,1000,200)]);
const superior=p('cima',300,face(0,2000,0,1000,0));
it('empilha sobre duas longarinas vazadas com calços em contato nas quatro regiões',()=>{
 const r=planejarCalcos(superior,[inferior]);expect(r?.length).toBeGreaterThanOrEqual(2);
 for(const c of r){expect(c.y).toBe(200);expect(c.A).toBe(100);expect(c.contatos).toHaveLength(2);expect(c.contatos[0].apoioId).toBe('base');}
});
it('recusa apoio concentrado em um lado e não preenche o vazio com caixa imaginária',()=>{
 expect(planejarCalcos(superior,[p('b',0,face(0,2000,0,150,200))])).toBeNull();
});
it('recusa calços excessivamente altos e recalcula depois de mover a peça',()=>{
 expect(planejarCalcos({...superior,y:900},[inferior])).toBeNull();
 expect(planejarCalcos({...superior,x:3000},[inferior])).toBeNull();
});
it('apoio inferior irregular é compensado com calço até a superfície real da peça de cima',()=>{
 const r=planejarCalcos(superior,[{...inferior,facesApoio:[...face(0,2000,0,250,180),...face(0,2000,750,1000,200)]}]);
 expect(r?.some(c=>c.A===20)).toBe(true);
});
