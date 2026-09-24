import fs from 'node:fs';
import {expandirPecas} from '../lib/carga/geometria';import {montarUnidades} from '../lib/carga/unidades';import {novoContexto,empacotar} from '../lib/carga/empacotar';import {PERFIS,VEICULOS} from '../lib/carga/premissas';
const geo=JSON.parse(fs.readFileSync('/tmp/carga102/geometria.json'));
for(const n of [1,2]){const e=JSON.parse(fs.readFileSync(`/tmp/carga102/entrada-${n}.json`));let best;
for(const [nome,cmp] of Object.entries({area:(a,b)=>b.C*b.L-a.C*a.L,comp:(a,b)=>b.C-a.C,peso:(a,b)=>b.kg-a.kg,larg:(a,b)=>b.L-a.L})){const ctx=novoContexto();if(n===2)ctx.veiculos={...ctx.veiculos,carreta:{...VEICULOS.carreta,L:2900,C:18000,nome:'Plataforma para carga larga — veículo a confirmar'}};const us=montarUnidades(expandirPecas(e.lista,geo),PERFIS.economico,'topo',ctx);for(const u of us)u.topoVazado=false;
const cs=empacotar(us.sort(cmp),'carreta',PERFIS.economico,ctx,[],'empilhar');console.log(n,nome,cs.length,us.filter(u=>u.semLugar).length);const score=cs.length*100+us.filter(u=>u.semLugar).length*10000+Math.max(...cs.map(c=>c.altura))/10000;if(!best||score<best.score)best={score,cs:structuredClone(cs)};}
fs.writeFileSync(`/tmp/carga102/previa-unica-${n}.json`,JSON.stringify(best.cs));}
