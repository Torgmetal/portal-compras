// Envelope vertical conservador por célula: recorta TODOS os triângulos, inclusive faces finas.
// Os vazios laterais ficam livres; cavidades fechadas na vertical continuam ocupadas.
const PASSO=50;
function recortar(pol,eixo,limite,maior){
 const out=[];for(let i=0;i<pol.length;i++){
  const a=pol[i],b=pol[(i+1)%pol.length],ia=maior?a[eixo]>=limite:a[eixo]<=limite,ib=maior?b[eixo]>=limite:b[eixo]<=limite;
  if(ia)out.push(a);if(ia!==ib){const t=(limite-a[eixo])/(b[eixo]-a[eixo]);out.push(a.map((v,j)=>v+(b[j]-v)*t));}
 }return out;
}
export function ocupacaoDaMalha({pos,idx},o){
 const {perm:p,giro:g}=o;if(!p||!idx?.length)return null;
 const pts=[],r=(g?.ang||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 for(let i=0;i<pos.length;i+=3){const[x,y,z]=[pos[i],pos[i+1],pos[i+2]];
 const q=!g?[x,y,z]:g.eixo===2?[x*c-y*s,x*s+y*c,z]:g.eixo===0?[x,y*c-z*s,y*s+z*c]:[x*c+z*s,y,-x*s+z*c];
 if(g)for(let j=0;j<3;j++)q[j]-=g.min[j];pts.push([q[p.X],q[p.Y],q[p.Z]]);}
 const mapa=new Map();
 for(let i=0;i<idx.length;i+=3){const tri=[pts[idx[i]],pts[idx[i+1]],pts[idx[i+2]]];
  const x0=Math.max(0,Math.floor(Math.min(...tri.map(v=>v[0]))/PASSO)),x1=Math.min(Math.ceil(o.C/PASSO)-1,Math.floor(Math.max(...tri.map(v=>v[0]))/PASSO));
  const z0=Math.max(0,Math.floor(Math.min(...tri.map(v=>v[2]))/PASSO)),z1=Math.min(Math.ceil(o.L/PASSO)-1,Math.floor(Math.max(...tri.map(v=>v[2]))/PASSO));
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
    let pol=tri;for(const[e,l,m]of[[0,x*PASSO,true],[0,(x+1)*PASSO,false],[2,z*PASSO,true],[2,(z+1)*PASSO,false]]){pol=recortar(pol,e,l,m);if(!pol.length)break;}
    if(!pol.length)continue;
    const min=Math.min(...pol.map(p=>p[1])),max=Math.max(...pol.map(p=>p[1])),k=x+','+z,ant=mapa.get(k);
    if(ant){ant.min=Math.min(ant.min,min);ant.max=Math.max(ant.max,max);}else mapa.set(k,{x:x*PASSO,z:z*PASSO,C:Math.min(PASSO,o.C-x*PASSO),L:Math.min(PASSO,o.L-z*PASSO),min,max});
  }
 }
 return {passo:PASSO,celulas:[...mapa.values()]};
}
