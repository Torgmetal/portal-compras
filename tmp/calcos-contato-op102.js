// Contato geométrico entre faces horizontais do IFC. Não calcula resistência da madeira/estrutura.
// Cada calço toca aço nas duas pontas; não transforma a caixa envolvente em superfície de apoio.
import { temGiroSemBaseConfirmada } from '../lib/carga/apoios';
const caches = new WeakMap();
function alturaFaces(faces,x,z,superior) {
  let registro=caches.get(faces);
  if(!registro){
    const bins=new Map();
    for(const f of faces){const [ax,az,bx,bz,cx,cz]=f;const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<.001)continue;
      const t={f,den,x0:Math.min(ax,bx,cx),x1:Math.max(ax,bx,cx),z0:Math.min(az,bz,cz),z1:Math.max(az,bz,cz)};
      for(let i=Math.floor(t.x0/200);i<=Math.floor(t.x1/200);i++)for(let j=Math.floor(t.z0/200);j<=Math.floor(t.z1/200);j++){const k=`${i},${j}`;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(t);}
    }
    registro={bins,cache:new Map()};caches.set(faces,registro);
  }
  const {bins,cache}=registro;
  const chave=`${x.toFixed(2)},${z.toFixed(2)},${superior}`;
  if(cache.has(chave))return cache.get(chave);
  let h=null;
  for(const t of bins.get(`${Math.floor(x/200)},${Math.floor(z/200)}`)||[]){
    if(x<t.x0-.01||x>t.x1+.01||z<t.z0-.01||z>t.z1+.01)continue;
    const [ax,az,bx,bz,cx,cz,y]=t.f,den=t.den;
    const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den;
    if(a>=-1e-6&&b>=-1e-6&&a+b<=1.000001)h=h===null?y:superior?Math.max(h,y):Math.min(h,y);
  }
  // Limita memória durante as várias tentativas de encaixe.
  if(cache.size>30000)cache.clear();cache.set(chave,h);return h;
}
function alturaLocal(u,x,z,superior){
  if(x<0||z<0||x>u.C||z>u.L)return null;
  if(u.tipo==='CAIXA'||u.tipo==='PALLET')return superior?u.A:0;
  if(u.facesApoio)return alturaFaces(u.facesApoio,x,z,superior);
  if(u.membros?.length){let h=null;
    for(const p of u.membros){const v=alturaLocal(p,x-(p.dx||0),z-(p.dz||0),superior);if(v===null)continue;const y=v+(p.dy||0);h=h===null?y:superior?Math.max(h,y):Math.min(h,y);}return h;
  }
  return null;
}
export function alturaContato(u,x,z,superior){
  if(temGiroSemBaseConfirmada(u)||u.rotacaoManual&&(u.rotacaoManual.x!==0||u.rotacaoManual.z!==0||u.rotacaoManual.y%180!==0))return null;
  let a=x-u.x,b=z-u.z;if(u.rotacaoManual?.y%360===180){a=(u.fx||u.C)-a;b=(u.fz||u.L)-b;}if(u.girada)[a,b]=[b,u.L-a];
  const h=alturaLocal(u,a,b,superior);return h===null?null:u.y+h;
}
export const temFacesApoio=u=>!!u.facesApoio||!!u.membros?.some(m=>m.facesApoio);
// Travessas entre camadas: contatos superiores e inferiores podem estar em posições diferentes.
// O desenho é um plano geométrico; seção, resistência e fixação devem ser dimensionadas no carregamento.
const candidatosCache=new WeakMap();
function contatosSuperiores(u,rx,lado){
 const fx=u.fx||u.C,fz=u.fz||u.L;
 const out=[];
 for(const rz of (lado===0?[.15,.10,.20,.05,.25,.30,.35,.40,.45]:[.85,.90,.80,.95,.75,.70,.65,.60,.55])){
   const x=rx*fx,z=rz*fz;
   const alturas=[[0,0],[-20,-20],[20,-20],[-20,20],[20,20]].map(([a,b])=>alturaContato({...u,x:0,y:0,z:0},x+a,z+b,false));
   if(alturas.every(v=>v!==null)&&Math.max(...alturas)-Math.min(...alturas)<=1)out.push({x,z,h:Math.min(...alturas)});
 }
 return out;
}
export function planejarCalcos(u,baixo){
 if(temGiroSemBaseConfirmada(u)||u.rotacaoManual&&(u.rotacaoManual.x!==0||u.rotacaoManual.z!==0||u.rotacaoManual.y%180!==0))return null;
 const fx=u.fx||u.C,fz=u.fz||u.L,n=2,out=[];
 const chaveBase=u.facesApoio||u.membros||u;
 let cache=candidatosCache.get(chaveBase);if(!cache){cache=new Map();candidatosCache.set(chaveBase,cache);}
 const chave=`${fx},${fz},${u.girada}`;
 let linhas=cache.get(chave);
 if(!linhas){linhas=[];
   for(let linha=0;linha<n;linha++){
    const alvo=.15+.7*linha/(n-1),opcoes=[];
    for(const dx of [0,-.04,.04,-.08,.08,-.12,.12,-.14,.14]){
     const rx=alvo+dx;if(rx*fx<20||(1-rx)*fx<20)continue;
     const esq=contatosSuperiores(u,rx,0),dir=contatosSuperiores(u,rx,1);
     if(esq.length&&dir.length)opcoes.push({rx,esq:esq[0],dir:dir[0]});
    }
    linhas.push(opcoes);
   }
   cache.set(chave,linhas);
 }
 if(linhas.some(opcoes=>!opcoes.length))return null;
 for(const opcoes of linhas){let escolhido=null;
   for(const opcao of opcoes){const x=u.x+opcao.rx*fx,calcos=[],topoTravessa=u.y+Math.min(opcao.esq.h,opcao.dir.h),baseTravessa=topoTravessa-100;let valido=true;
     if(Math.abs(opcao.esq.h-opcao.dir.h)>100)continue;
     for(const lado of [0,1]){let contato=null;
       for(const rz of (lado===0?[.10,.05,.15,.20,.25,.30,.35,.40,.45]:[.90,.95,.85,.80,.75,.70,.65,.60,.55])){
         const z=u.z+rz*fz,pontos=[[0,0],[-20,-20],[20,-20],[-20,20],[20,20]];
         for(const b of baixo){
           if(b.nadaEmCima||b.emPe||b.baseEmV)continue;
           const alturas=pontos.map(([a,c])=>alturaContato(b,x+a,z+c,true));
           if(alturas.some(v=>v===null)||Math.max(...alturas)-Math.min(...alturas)>1)continue;
           const y=Math.max(...alturas),A=baseTravessa-y;
           if(A<-.5||A>150)continue;
           // Não atravessa outra peça situada acima deste contato.
           if(baixo.some(o=>o!==b&&pontos.some(([a,c])=>{const h=alturaContato(o,x+a,z+c,true);return h!==null&&h>y+1;})))continue;
           contato={x:x-20,z:z-20,y,C:40,L:40,A:Math.max(0,A),apoioId:b.id,tipo:'calcoInferior'};break;
         }
         if(contato)break;
       }
       if(!contato){valido=false;break;}calcos.push(contato);
     }
     if(!valido)continue;
     for(const p of [opcao.esq,opcao.dir])if(u.y+p.h-topoTravessa>1)calcos.push({x:u.x+p.x-20,z:u.z+p.z-20,y:topoTravessa,C:40,L:40,A:u.y+p.h-topoTravessa,tipo:'calcoSuperior'});
     escolhido=[{x:x-50,z:u.z,y:baseTravessa,C:100,L:fz,A:100,tipo:'travessa',contatos:calcos.filter(c=>c.tipo==='calcoInferior')},...calcos.filter(c=>c.A>1)];break;
   }
   if(!escolhido)return null;out.push(...escolhido);
 }
 return out;
}
