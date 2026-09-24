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

function valido(u,wood){for(const o of us){if(o.id===u.id)continue;if(o.id!==b.id&&col(box(u),box(o)))return false;const so=solids(o);if(o.id===b.id&&solids(u).some(a=>so.some(c=>col(a,c))))return false;if(wood.some(a=>so.some(c=>col(a,c))&&madeiraIntersecta(a,o)))return false;for(const a of o.apoiosEstudo||[])if(col(a,box(u))||wood.some(w=>col(w,a)))return false;}
const su=solids(u);return !wood.some(a=>su.some(c=>col(a,c))&&madeiraIntersecta(a,u));}
const moved=[];
for(const id of ['p19','k0','p14','p50']){const orig=faces(structuredClone(us.find(u=>u.id===id)));let found=null;
for(const y of [400,300,350,450,250,500]){if(found)break;for(let x=b.x+50;x+orig.C<=b.x+b.C;x+=250){if(found)break;for(let z=b.z;z+orig.L<=b.z+b.L;z+=50){const u={...orig,x,y,z,fx:orig.C,fz:orig.L,girada:false,rotacaoManual:{x:0,y:0,z:0}};const wood=planejarCalcos(u,[b]);if(wood&&valido(u,wood)){found={...u,apoiosEstudo:wood,sobre:[b.id],situacaoApoio:'Sobre a T102B45 · contatos de madeira conferidos no modelo',camada:1};break;}}}}
if(found){const i=us.findIndex(u=>u.id===id);us[i]=found;moved.push({id,marca:orig.rotulo,x:found.x,y:found.y,z:found.z,apoios:found.apoiosEstudo.length});}else console.log('Sem posição validada',id);}
assert.ok(moved.length>=2,'Não gravar sem ao menos duas peças reposicionadas com apoio');
for(const u of us){delete u.facesApoio;for(const m of u.membros||[])delete m.facesApoio;}
us.sort((a,b)=>a.y-b.y||a.x-b.x);us.forEach((u,i)=>u.volume=i+1);r.carga.passos=us.map(u=>u.id);r.ajusteViga=moved;r.hipotese='Hipótese de plataforma de 18,00 × 2,90 m; transporte a confirmar. Peças redistribuídas sobre a T102B45, com madeira nos contatos encontrados. Os demais apoios continuam em revisão.';d.geradoEm=new Date().toISOString();fs.copyFileSync(file,file+'.antes-viga');fs.writeFileSync(file,JSON.stringify(d));console.log('AJUSTADOS',moved);
