import fs from 'node:fs';import {planejarCalcos} from './calcos-contato-op102';
const s=JSON.parse(fs.readFileSync('/tmp/carga102/config.json')).sims[1],g=JSON.parse(fs.readFileSync('/tmp/carga102/geometria.json')),us=s.cargas.flatMap(c=>c.itens);const b={...us.find(u=>u.rotulo==='T102B45'),x:50,z:50,y:0,facesApoio:g.T102B45.apoioSuperior.faces};const a={...us.find(u=>u.rotulo==='T102A16'),facesApoio:g.T102A16.apoioSuperior.faces,rotacaoManual:{x:0,y:0,z:0},girada:false};let n=0;
for(let x=100;x<5000;x+=100)for(let z=350;z<700;z+=25){const u={...a,x,y:400,z},cs=planejarCalcos(u,[b]);if(cs){console.log(x,z,cs);fs.writeFileSync('/tmp/carga102/apoio-longa.json',JSON.stringify({...u,calcos:cs,sobre:[b.id]}));n++;break;}if(n)break;}
console.log('solucoes',n);
