// Encaixe no piso pela projeção conservadora do aço. Sem empilhamento, sem colisão entre projeções.
// A borda extra de uma célula mantém folga entre peças e protege contra erros de discretização.
import { planejarCalcos } from "./calcos-contato-op102";
import { baseCompativelParaCaixa } from "../lib/carga/apoios";
const CEL=50;
function retangulos(u){
 if(u.tipo==='PECA'&&u.ocupacao?.celulas?.length)return u.ocupacao.celulas;
 return [{x:0,z:0,C:u.C,L:u.L}];
}
function mascara(u,girada,virada){
 const ocupados=new Set();
 for(const r of retangulos(u)){
 let x=girada?u.L-r.z-r.L:r.x,z=girada?r.x:r.z;const C=girada?r.L:r.C,L=girada?r.C:r.L;
 if(virada){x=(girada?u.L:u.C)-x-C;z=(girada?u.C:u.L)-z-L;}
 for(let a=Math.floor(x/CEL);a<Math.ceil((x+C)/CEL);a++)for(let b=Math.floor(z/CEL);b<Math.ceil((z+L)/CEL);b++)ocupados.add(a+','+b);
 }
 return [...ocupados].map(k=>k.split(',').map(Number));
}
export function encaixarNoPiso(ordem,veic,preferirOriginal=true){
 const nx=Math.floor(veic.C/CEL),nz=Math.floor(veic.L/CEL),cargas=[];let livres=[];
 for(const u of ordem){
  const opcoes=[false,true].filter(g=>!g||u.C+60<=veic.L).flatMap(g=>[false,true].map(v=>({g,v,fx:g?u.L:u.C,fz:g?u.C:u.L,mask:mascara(u,g,v)})));
  let posto=false;
  for(let ci=0;ci<=cargas.length;ci++){
   if(ci===cargas.length){cargas.push({itens:[],peso:0,altura:0,veic,veicKey:veic.chave,zonaGC:0,pilhas:[]});livres.push(new Uint8Array(nx*nz));}
   const c=cargas[ci],map=livres[ci];if(c.peso+u.kg>veic.pesoMax)continue;
   if(u.tipo==='CAIXA'&&!u.soChao){
     let empilhada=false;
     for(const b of c.itens.filter(b=>b.tipo==='CAIXA'&&b.y===0&&!c.itens.some(a=>a.sobre?.includes(b.id)))){
      const cand={...u,x:b.x,z:b.z,y:b.A+100,fx:u.C,fz:u.L,girada:false};
      if(cand.y+u.A<=veic.alturaUtil&&baseCompativelParaCaixa(cand,[b],c.itens,100)){
       Object.assign(u,{x:b.x,z:b.z,y:cand.y,fx:u.C,fz:u.L,girada:false,rotacaoManual:{x:0,y:0,z:0},nivelPilha:1,sobre:[b.id],pilha:false});delete u.semLugar;
       c.itens.push(u);c.peso+=u.kg;c.altura=Math.max(c.altura,u.y+u.A);empilhada=true;break;
      }
     }
     if(empilhada){posto=true;break;}
   }
   let melhor=null;
   for(const op of opcoes){if(u.A>veic.alturaUtil)continue;
    for(let x=1;x*CEL+op.fx+30<=veic.C;x++)for(let z=1;z*CEL+op.fz+30<=veic.L;z++){
     const score=x*CEL+op.fx+z*.01+(preferirOriginal&&op.g?veic.C:0);if(melhor&&score>=melhor.score)continue;
     if(op.mask.some(([a,b])=>map[(a+x)*nz+b+z]))continue;
     melhor={x,z,score,...op};
    }
   }
   if(!melhor && u.tipo==='PECA'&&u.facesApoio&&!u.soChao&&!u.emPe){
     for(const b of c.itens){
      if(b.nadaEmCima||b.emPe||b.tipo==='CAIXA'||b.classe===3)continue;
      for(const g of [false,true])for(const rx of [0,.5,1])for(const rz of [0,.5,1]){
       if(posto)continue;
       const fx=g?u.L:u.C,fz=g?u.C:u.L;
       if(fx>b.fx||fz>b.fz)continue;
       const x=Math.ceil((b.x+(b.fx-fx)*rx)/CEL)*CEL,z=Math.ceil((b.z+(b.fz-fz)*rz)/CEL)*CEL;
       if(x+fx+30>veic.C||z+fz+30>veic.L)continue;
       const baixo=c.itens.filter(d=>d.x<x+fx&&d.x+d.fx>x&&d.z<z+fz&&d.z+d.fz>z);
       const y=alturaDeEncaixe(u,x,z,g,c.itens,nx,nz);
       if(y<=0)continue;
       if(y+u.A>veic.alturaUtil)continue;
       const cand={...u,x,y,z,fx,fz,girada:g,rotacaoManual:{x:0,y:0,z:0}};
       const calcos=planejarCalcos(cand,baixo);if(!calcos)continue;
       Object.assign(u,cand,{calcos,sobre:baixo.map(d=>d.id),nivelPilha:1,pilha:false});delete u.semLugar;
       c.itens.push(u);c.peso+=u.kg;c.altura=Math.max(c.altura,y+u.A);posto=true;break;
      }
      if(posto)break;
     }
     if(posto)break;
   }
   if(melhor){const {x,z,g,v,fx,fz,mask}=melhor;Object.assign(u,{x:x*CEL,z:z*CEL,y:0,fx,fz,girada:g,rotacaoManual:{x:0,y:v?180:0,z:0},nivelPilha:0,sobre:[],pilha:false});delete u.semLugar;
    for(const [a,b]of mask)for(let da=-1;da<=1;da++)for(let db=-1;db<=1;db++){const xx=a+x+da,zz=b+z+db;if(xx>=0&&xx<nx&&zz>=0&&zz<nz)map[xx*nz+zz]=1;}
    c.itens.push(u);c.peso+=u.kg;c.altura=Math.max(c.altura,u.A);posto=true;break;
   }
   if(!c.itens.length){cargas.pop();livres.pop();break;}
  }
  if(!posto)u.semLugar=true;
 }
 return cargas;
}

const cacheAlturas=new WeakMap();
function alturasLocais(u,girada=false,virada=false){
 let cache=cacheAlturas.get(u);if(!cache){cache=new Map();cacheAlturas.set(u,cache);}const chave=`${girada},${virada}`;if(cache.has(chave))return cache.get(chave);
 const mapa=new Map(),rs=u.tipo==='PECA'&&u.ocupacao?.celulas?.length?u.ocupacao.celulas:[{x:0,z:0,C:u.C,L:u.L,min:0,max:u.A}];
 for(const r of rs){let x=girada?u.L-r.z-r.L:r.x,z=girada?r.x:r.z;const C=girada?r.L:r.C,L=girada?r.C:r.L;
 if(virada){x=(girada?u.L:u.C)-x-C;z=(girada?u.C:u.L)-z-L;}
 for(let a=Math.floor(x/CEL);a<Math.ceil((x+C)/CEL);a++)for(let b=Math.floor(z/CEL);b<Math.ceil((z+L)/CEL);b++){
 const k=a+','+b,ant=mapa.get(k);if(ant){ant.min=Math.min(ant.min,r.min);ant.max=Math.max(ant.max,r.max);}else mapa.set(k,{a,b,min:r.min,max:r.max});}
 }
 const out=[...mapa.values()];cache.set(chave,out);return out;
}
function alturaDeEncaixe(u,x,z,girada,itens,nx,nz){
 const alt=new Float64Array(nx*nz);alt.fill(-Infinity);
 for(const b of itens)for(const r of alturasLocais(b,b.girada,b.rotacaoManual?.y===180)){
  const a=Math.floor(b.x/CEL)+r.a,c=Math.floor(b.z/CEL)+r.b;if(a>=0&&a<nx&&c>=0&&c<nz)alt[a*nz+c]=Math.max(alt[a*nz+c],b.y+r.max);
 }
 let y=0;for(const r of alturasLocais(u,girada)){const a=Math.floor(x/CEL)+r.a,b=Math.floor(z/CEL)+r.b;if(a>=0&&a<nx&&b>=0&&b<nz&&Number.isFinite(alt[a*nz+b]))y=Math.max(y,alt[a*nz+b]+100-r.min);}
 return Math.ceil(y);
}
