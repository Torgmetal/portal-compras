// Leitura compartilhada entre edição, medição, PDF e reinspeção.
// Texto livre continua preservado; só limites reconhecidos são comparados.
export function limitesTolerancia(valor) {
 const s=String(valor??'').trim().replace(/\s*mm$/i,'').replace(/\s+/g,'').replace(/,/g,'.');
 const n='(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
 const sim=s.match(new RegExp(`^(?:±|\\+/-)?(${n})$`));
 if(sim){const v=Number(sim[1]);return Number.isFinite(v)?{min:v===0?0:-v,max:v}:null;}
 const par=s.match(new RegExp(`^([+-]${n})/([+-]${n})$`));
 if(par){const a=Number(par[1]),b=Number(par[2]);if(Number.isFinite(a)&&Number.isFinite(b)&&a*b<=0&&a!==b)return {min:Math.min(a,b),max:Math.max(a,b)};}
 return null;
}
export function foraDaTolerancia(linha) {
 if(linha?.encontradoMm==null||linha.encontradoMm===''||linha?.projetoMm==null||linha.projetoMm==='')return null;
 const limite=limitesTolerancia(linha.tolerancia),dif=Number(linha.encontradoMm)-Number(linha.projetoMm);
 if(!limite||!Number.isFinite(dif))return null;
 // Protege apenas o arredondamento binário na borda, sem alargar a tolerância.
 const epsilon=Number.EPSILON*Math.max(1,Math.abs(Number(linha.encontradoMm)),Math.abs(Number(linha.projetoMm)))*4;
 return dif<limite.min-epsilon||dif>limite.max+epsilon;
}
