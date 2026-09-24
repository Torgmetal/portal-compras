import fs from 'node:fs';import {planejarCalcos} from './calcos-contato-op102';
const d=JSON.parse(fs.readFileSync('/tmp/carga102/previa-visual.json')),g=JSON.parse(fs.readFileSync('/tmp/carga102/geometria.json')),r=d.romaneios[1],us=r.carga.itens,b=us.find(u=>u.marca==='T102B45');
function faces(u){u.facesApoio=g[u.marca]?.apoioSuperior?.faces;for(const m of u.membros||[])m.facesApoio=g[m.marca]?.apoioSuperior?.faces;return u;}
faces(b);const out=[];
for(const id of ['p19','k0','p50','p35','p14','p9']){const orig=faces(structuredClone(us.find(u=>u.id===id)));let found=null,attempts=0;
for(const y of [400,300,250,350,450,500]){if(found)break;for(let x=b.x+50;x+orig.C<=b.x+b.C;x+=250){if(found)break;for(let z=b.z;z+orig.L<=b.z+b.L;z+=50){const u={...orig,x,y,z,fx:orig.C,fz:orig.L,girada:false,rotacaoManual:{x:0,y:0,z:0}};attempts++;const calcos=planejarCalcos(u,[b]);if(calcos){found={...u,apoiosEstudo:calcos,sobre:[b.id]};break;}}}}
console.log(id,attempts,found?{x:found.x,y:found.y,z:found.z,wood:found.apoiosEstudo.length}:null);if(found)out.push(found);}
fs.writeFileSync('/tmp/carga102/candidatos-sobre-viga.json',JSON.stringify(out));
