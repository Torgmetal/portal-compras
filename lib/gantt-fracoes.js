// As faixas identificam unidades de planejamento da marca, sem criar novas peças na LPC.
export const inicioDaFracao = item => item.inicioUnidade || 0;

export function fracionarItem(item, inicio, quantidade) {
  const deslocamento = inicio - inicioDaFracao(item);
  const feitas = Math.max(0, Math.min(quantidade, (item.f || 0) - deslocamento));
  const pendentes = Math.max(0, item.q - (item.f || 0));
  return {...item, inicioUnidade:inicio, q:quantidade, f:feitas,
    kg:item.kg * quantidade / item.q,
    c:pendentes ? (item.c || 0) * (quantidade - feitas) / pendentes : 0};
}

export function agruparFracoes(itens) {
  const porMarca = new Map();
  for (const item of itens) {
    if (!porMarca.has(item.id)) porMarca.set(item.id, []);
    porMarca.get(item.id).push(item);
  }
  const saida=[];
  for (const partes of porMarca.values()) {
    let anterior;
    for (const item of [...partes].sort((a,b)=>inicioDaFracao(a)-inicioDaFracao(b))) {
      if (anterior && inicioDaFracao(anterior)+anterior.q===inicioDaFracao(item)) {
        anterior.q+=item.q; anterior.kg+=item.kg; anterior.c+=(item.c||0); anterior.f+=(item.f||0);
      } else { anterior={...item,inicioUnidade:inicioDaFracao(item),f:item.f||0,c:item.c||0}; saida.push(anterior); }
    }
  }
  return saida;
}

export function removerFracoes(itens, removidos) {
  return itens.flatMap(item=>{
    let intervalos=[[inicioDaFracao(item),inicioDaFracao(item)+item.q]];
    for (const retirar of removidos.filter(r=>r.id===item.id)) {
      const de=inicioDaFracao(retirar), ate=de+retirar.q;
      intervalos=intervalos.flatMap(([a,b])=>b<=de||a>=ate?[[a,b]]:
        [...(a<de?[[a,de]]:[]),...(b>ate?[[ate,b]]:[])]);
    }
    return intervalos.map(([a,b])=>fracionarItem(item,a,b-a));
  });
}

export function fracoesSobrepostas(a,b) {
  return a.some(x=>b.some(y=>x.id===y.id && inicioDaFracao(x)<inicioDaFracao(y)+y.q
    && inicioDaFracao(y)<inicioDaFracao(x)+x.q));
}

// Só a tabela de projetos resume por marca. A grade e os movimentos mantêm as faixas.
export function resumirMarcas(itens) {
  const mapa=new Map();
  for(const i of itens) {
    const anterior=mapa.get(i.id);
    if(anterior) {anterior.q+=i.q; anterior.kg+=i.kg; anterior.c+=i.c||0; anterior.f+=i.f||0;}
    else mapa.set(i.id,{...i,c:i.c||0,f:i.f||0});
  }
  return [...mapa.values()];
}
