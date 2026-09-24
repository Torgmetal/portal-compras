// Triagem geométrica conservadora: só a superfície horizontal no topo pode apoiar
// outro volume. Não mede resistência, centro de gravidade ou capacidade de amarração.
export function superficieSuperior(malha, orientacao) {
 const {pos,idx}=malha, {perm:P,giro,C,L,A}=orientacao;
 if(!P||!(C>0&&L>0&&A>0)||!idx?.length)return {plana:false,fracao:0};
 const pontos=new Float64Array(pos.length),r=(giro?.ang||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 for(let i=0;i<pos.length;i+=3){
  const [x,y,z]=[pos[i],pos[i+1],pos[i+2]];
  const q=!giro?[x,y,z]:giro.eixo===2?[x*c-y*s,x*s+y*c,z]:giro.eixo===0?[x,y*c-z*s,y*s+z*c]:[x*c+z*s,y,-x*s+z*c];
  if(giro)for(let j=0;j<3;j++)q[j]-=giro.min[j];
  pontos[i]=q[P.X];pontos[i+1]=q[P.Y];pontos[i+2]=q[P.Z];
 }
 const faces=[];
 for(let i=0;i<idx.length;i+=3){
  const a=idx[i]*3,b=idx[i+1]*3,d=idx[i+2]*3;
  const ys=[pontos[a+1],pontos[b+1],pontos[d+1]];
  if(Math.max(...ys)-Math.min(...ys)<=.5)faces.push([pontos[a],pontos[a+2],pontos[b],pontos[b+2],pontos[d],pontos[d+2],ys[0]]);
 }
 const nx=20,nz=10,coberta=new Uint8Array(nx*nz),passoX=C/nx,passoZ=L/nz;
 for(let i=0;i<idx.length;i+=3){
  const a=idx[i]*3,b=idx[i+1]*3,d=idx[i+2]*3;
  if([a,b,d].some(k=>Math.abs(pontos[k+1]-A)>2))continue;
  const ax=pontos[a],az=pontos[a+2],bx=pontos[b],bz=pontos[b+2],dx=pontos[d],dz=pontos[d+2];
  const den=(bz-dz)*(ax-dx)+(dx-bx)*(az-dz);if(Math.abs(den)<1e-6)continue;
  const x0=Math.max(0,Math.floor(Math.min(ax,bx,dx)/passoX)),x1=Math.min(nx-1,Math.floor(Math.max(ax,bx,dx)/passoX));
  const z0=Math.max(0,Math.floor(Math.min(az,bz,dz)/passoZ)),z1=Math.min(nz-1,Math.floor(Math.max(az,bz,dz)/passoZ));
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
   const px=(x+.5)*passoX,pz=(z+.5)*passoZ;
   const u=((bz-dz)*(px-dx)+(dx-bx)*(pz-dz))/den,v=((dz-az)*(px-dx)+(ax-dx)*(pz-dz))/den;
   if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)coberta[x*nz+z]=1;
  }
 }
 const quadrantes=[0,0,0,0];let total=0;
 for(let x=0;x<nx;x++)for(let z=0;z<nz;z++)if(coberta[x*nz+z]){total++;quadrantes[(x>=10?2:0)+(z>=5?1:0)]++;}
 return {plana:total>=160&&quadrantes.every(n=>n>=25),fracao:total/(nx*nz),faces};
}
