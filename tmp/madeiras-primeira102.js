import fs from 'node:fs';import * as THREE from 'three';import assert from 'node:assert/strict';import {alturaContato,planejarCalcos} from './calcos-previa-viga102';
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



// Calços da prévia: contato geométrico, sem certificação estrutural.
for(const u of us){u.y+=100;for(const w of u.apoiosEstudo||[]){w.y+=100;for(const c of w.contatos||[])c.y+=100;}}
const deck={id:'assoalho',tipo:'PALLET',x:0,y:-100,z:0,C:12400,L:2450,A:100};us.forEach(faces);
const madeiras=us.flatMap(u=>u.apoiosEstudo||[]);
// Repõe a ligação ao assoalho após reservar espaço para a madeira da primeira peça.
for(const u of us){const adicionados=[];for(const w of u.apoiosEstudo||[]){if(w.apoioId==='assoalho'&&Math.abs(w.y-100)<1)adicionados.push({...w,y:0,A:100,tipo:'caibroBase'});}u.apoiosEstudo=[...(u.apoiosEstudo||[]),...adicionados];}
for(const u of us.filter(u=>!u.apoiosEstudo?.length)){
 const candidatos=[]; const fx=u.fx||u.C,fz=u.fz||u.L;
 for(let x=u.x+60;x<u.x+fx-40;x+=20)for(let z=Math.max(60,u.z+60);z<Math.min(2390,u.z+fz-40);z+=20){
 const ps=[[0,0],[-20,-20],[20,-20],[-20,20],[20,20]];
 const hs=ps.map(([a,b])=>alturaContato(u,x+a,z+b,false));if(hs.some(h=>h===null)||Math.max(...hs)-Math.min(...hs)>1)continue;
 const top=Math.min(...hs);const bases=[...us.filter(o=>o.id!==u.id&&o.y<top),deck];
 for(const base of bases){const bs=ps.map(([a,b])=>alturaContato(base,x+a,z+b,true));if(bs.some(h=>h===null)||Math.max(...bs)-Math.min(...bs)>1)continue;const bottom=Math.max(...bs);if(top-bottom<5||top-bottom>700)continue;
 const w={x:x-20,z:z-20,y:bottom,C:40,L:40,A:top-bottom,apoioId:base.id,tipo:'calcoMadeira'};
 if(us.some(o=>madeiraIntersecta(w,o))||us.flatMap(o=>o.apoiosEstudo||[]).some(o=>col(w,o)))continue;
 candidatos.push(w);break;}
 }
 // Distribui apoios nos quatro quadrantes da peça, sem inventar superfícies nos vazios.
 const escolhidos=[];for(const rx of [.15,.85])for(const rz of [.2,.8]){const x=u.x+fx*rx,z=u.z+fz*rz;const opts=candidatos.filter(w=>!escolhidos.some(e=>Math.hypot(e.x-w.x,e.z-w.z)<120)).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));if(opts[0])escolhidos.push(opts[0]);}
 u.apoiosEstudo=escolhidos.flatMap(w=>{const out=[];for(let y=w.y;y<w.y+w.A-.1;y+=100)out.push({...w,y,A:Math.min(100,w.y+w.A-y)});return out;});
 u.situacaoApoio=(u.id==='p49'?'Primeira peça · AET · ':'')+(escolhidos.length>=4?'Calços de madeira visíveis · conferir resistência e amarração':'Apoios incompletos · conferir acomodação');
 console.log(u.id,u.rotulo,'apoios',escolhidos.length);
}
for(const u of us){delete u.facesApoio;for(const m of u.membros||[])delete m.facesApoio;}
fs.writeFileSync('/tmp/carga102/candidato-madeiras.json',JSON.stringify(d));
