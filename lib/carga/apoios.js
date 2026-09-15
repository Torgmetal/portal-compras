// Conferência da projeção das bases. Não pressupõe que uma peça vazada seja uma superfície maciça.
export function coberturaDaBase(u, apoios) {
  const fx=u.fx||u.C,fz=u.fz||u.L;
  let n=0;const quadrantes=[0,0,0,0];
  for(let i=0;i<20;i++)for(let j=0;j<10;j++){
    const x=u.x+fx*(i+.5)/20,z=u.z+fz*(j+.5)/10;
    if(apoios.some(b=>x>=b.x&&x<=b.x+(b.fx||b.C)&&z>=b.z&&z<=b.z+(b.fz||b.L))){n++;quadrantes[(i>=10?2:0)+(j>=5?1:0)]++;}
  }
  return {fracao:n/200,suficiente:n>=160&&quadrantes.every(q=>q>=25)};
}
export const temGiroSemBaseConfirmada = u => !!(u.rotacaoManual && (u.rotacaoManual.x%180 || u.rotacaoManual.z%180 || u.rotacaoManual.y%90));
/** Encaixe geométrico em duas camadas; a resistência da embalagem precisa ser conferida. */
export function baseCompativelParaCaixa(u, apoios, itens = [], madeira = 100) {
  if (temGiroSemBaseConfirmada(u)) return null;
  const fx=u.fx||u.C,fz=u.fz||u.L;
  return apoios.find(b=>b.tipo==='CAIXA' && !b.nadaEmCima && !b.emPe && !temGiroSemBaseConfirmada(b)
    && b.y<=1 && u.kg>0 && b.kg>=u.kg+itens.filter(p=>p.id!==u.id&&p.id!==b.id
      && Math.abs(p.y-(b.y+(b.fy||b.A)+madeira))<=2
      && Math.min(p.x+(p.fx||p.C),b.x+(b.fx||b.C))>Math.max(p.x,b.x)
      && Math.min(p.z+(p.fz||p.L),b.z+(b.fz||b.L))>Math.max(p.z,b.z)).reduce((s,p)=>s+p.kg,0)
    && u.x>=b.x-1 && u.z>=b.z-1
    && u.x+fx<=b.x+(b.fx||b.C)+1 && u.z+fz<=b.z+(b.fz||b.L)+1) || null;
}
