import fs from 'node:fs';import * as THREE from 'three';import assert from 'node:assert/strict';import {planejarCalcos} from './calcos-previa-viga102';
const file='/tmp/carga102/previa-visual.json',d=JSON.parse(fs.readFileSync(file)),g=JSON.parse(fs.readFileSync('/tmp/carga102/geometria.json')),r=d.romaneios[1],us=r.carga.itens,b=us.find(u=>u.marca==='T102B45');
const faces=u=>{u.facesApoio=g[u.marca]?.apoioSuperior?.faces;for(const m of u.membros||[])m.facesApoio=g[m.marca]?.apoioSuperior?.faces;return u;};faces(b);
const col=(a,b)=>a.x<b.x+b.C-2&&b.x<a.x+a.C-2&&a.z<b.z+b.L-2&&b.z<a.z+a.L-2&&a.y<b.y+b.A-2&&b.y<a.y+a.A-2;
const box=u=>({x:u.x,y:u.y,z:u.z,C:u.fx||u.C,L:u.fz||u.L,A:u.A});
function local(u){if(u.tipo==='CAIXA'||u.tipo==='PALLET')return [{x:0,y:0,z:0,C:u.C,L:u.L,A:u.A}];if(g[u.marca]?.ocupacao)return g[u.marca].ocupacao.celulas.map(c=>({x:c.x,y:c.min,z:c.z,C:c.C,L:c.L,A:c.max-c.min}));if(u.membros?.length)return u.membros.flatMap(m=>local(m).map(c=>({...c,x:c.x+(m.dx||0),y:c.y+(m.dy||0),z:c.z+(m.dz||0)})));return [{x:0,y:0,z:0,C:u.C,L:u.L,A:u.A}];}
function solids(u){return local(u).map(c=>u.girada?{x:u.x+u.L-c.z-c.L,y:u.y+c.y,z:u.z+c.x,C:c.L,L:c.C,A:c.A}:{...c,x:u.x+c.x,y:u.y+c.y,z:u.z+c.z});}

const malhas=JSON.parse(fs.readFileSync('/tmp/carga102/malhas.json')),triCache=new WeakMap();
function tris(u){if(triCache.has(u))return triCache.get(u);const out=[];for(const m of u.tipo==='PECA'?[u]:(u.membros||[])){const mesh=malhas[m.marca],p=m.perm,gi=m.giro;if(!mesh||!p)continue;const a=(gi?.ang||0)*Math.PI/180,c=Math.cos(a),sn=Math.sin(a),vs=[];
for(let i=0;i<mesh.pos.length;i+=3){let [x,y,z]=mesh.pos.slice(i,i+3);let q=!gi?[x,y,z]:gi.eixo===2?[x*c-y*sn,x*sn+y*c,z]:gi.eixo===0?[x,y*c-z*sn,y*sn+z*c]:[x*c+z*sn,y,-x*sn+z*c];if(gi)q=q.map((v,i)=>v-gi.min[i]);x=q[p.X]+(m.dx||0);y=q[p.Y]+(m.dy||0);z=q[p.Z]+(m.dz||0);if(u.girada)[x,z]=[u.L-z,x];vs.push(new THREE.Vector3(x+u.x,y+u.y,z+u.z));}
for(let i=0;i<mesh.idx.length;i+=3)out.push(new THREE.Triangle(vs[mesh.idx[i]],vs[mesh.idx[i+1]],vs[mesh.idx[i+2]]));}triCache.set(u,out);return out;}
function madeiraIntersecta(w,u){if(u.tipo==='CAIXA'||u.tipo==='PALLET')return col(w,box(u));const ts=tris(u);if(!ts.length)return true;const b=new THREE.Box3(new THREE.Vector3(w.x+1,w.y+1,w.z+1),new THREE.Vector3(w.x+w.C-1,w.y+w.A-1,w.z+w.L-1));return ts.some(t=>b.intersectsTriangle(t));}


const oldIds=us.map(u=>u.id).sort().join(',');const edits=[];
function valido(u,wood=[]){const su=solids(u);for(const o of us){if(o.id===u.id||o.acomodacaoPendente)continue;const so=solids(o);if(col(box(u),box(o))&&su.some(a=>so.some(c=>col(a,c))))return false;if(wood.some(a=>so.some(c=>col(a,c))&&madeiraIntersecta(a,o)))return false;for(const a of o.apoiosEstudo||[])if(madeiraIntersecta(a,u)||wood.some(w=>col(w,a)))return false;}return !wood.some(a=>su.some(c=>col(a,c))&&madeiraIntersecta(a,u));}
function aplicar(u){us[us.findIndex(v=>v.id===u.id)]=u;edits.push({id:u.id,marca:u.rotulo,x:u.x,y:u.y,z:u.z});}
// Empilha a caixa menor sobre a caixa de dimensões maiores para liberar piso.
const base=faces(us.find(u=>u.id==='l8')),cx=faces(structuredClone(us.find(u=>u.id==='l7'))),nova={...cx,x:base.x+50,z:base.z,y:base.y+base.A+100,girada:false,fx:cx.C,fz:cx.L,rotacaoManual:{x:0,y:0,z:0}};const ws=planejarCalcos(nova,[base]);if(ws&&valido(nova,ws))aplicar({...nova,apoiosEstudo:ws,sobre:[base.id],situacaoApoio:'Caixa menor sobre caixa maior · conferir resistência',camada:2});
for(const id of ['p53','p52','p35','p34','p9','p14','p50','p15']){const orig=faces(structuredClone(us.find(u=>u.id===id)));let found=null;
for(const girada of [false,true]){if(found)break;const fx=girada?orig.L:orig.C,fz=girada?orig.C:orig.L;
for(let x=30;x+fx<=12370&&!found;x+=150)for(let z=30;z+fz<=2420;z+=100){const u={...orig,x,y:0,z,fx,fz,girada,rotacaoManual:{x:0,y:0,z:0},acomodacaoPendente:false};if(valido(u)){found={...u,apoiosEstudo:[],sobre:[],situacaoApoio:'No piso · conferir calçamento',camada:0};break;}}}
if(!found){for(const base of us.filter(u=>!u.acomodacaoPendente&&u.tipo==='PECA'&&!u.emPe)){if(found)break;faces(base);for(const girada of [false,true]){if(found)break;const fx=girada?orig.L:orig.C,fz=girada?orig.C:orig.L;
for(const rx of [0,.5,1])for(const rz of [0,.5,1]){if(found)break;const x=base.x+(base.fx-fx)*rx,z=base.z+(base.fz-fz)*rz;if(x<30||z<30||x+fx>12370||z+fz>2420)continue;
for(const dy of [100,150,200]){const u={...orig,x,z,y:base.y+base.A+dy,fx,fz,girada,rotacaoManual:{x:0,y:0,z:0},acomodacaoPendente:false};if(u.y+u.A>2900)continue;const wood=planejarCalcos(u,[base]);if(wood&&valido(u,wood)){found={...u,apoiosEstudo:wood,sobre:[base.id],situacaoApoio:'Empilhamento proposto · contatos geométricos verificados',camada:(base.camada||0)+1};break;}}}}}}
if(found){aplicar(found);console.log('POSICIONADO',id,found.x,found.y,found.z);}else console.log('PENDENTE',id);}
assert.equal(us.map(u=>u.id).sort().join(','),oldIds);assert.equal(us.reduce((s,u)=>s+(u.membros||[u]).length,0),58);
for(const u of us){delete u.facesApoio;for(const m of u.membros||[])delete m.facesApoio;}
us.sort((a,b)=>Number(a.acomodacaoPendente)-Number(b.acomodacaoPendente)||a.y-b.y||a.x-b.x);us.forEach((u,i)=>u.volume=i+1);r.carga.passos=us.map(u=>u.id);r.ultimaRedistribuicao=edits;r.hipotese='Carreta de 12,40 × 2,45 m. Redistribuição para uma carga, com todas as peças preservadas. A T102B34, de 2,74 m de largura deitada, depende de definição de transporte.';d.geradoEm=new Date().toISOString();fs.copyFileSync(file,file+'.antes-restantes');fs.writeFileSync(file,JSON.stringify(d));console.log('RESULTADO',edits.length,'mudanças;',us.filter(u=>u.acomodacaoPendente).length,'pendentes');
