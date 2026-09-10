// O banco guarda um destino por peça/setor. Movimentos intermediários da sessão
// não devem ser regravados, nem a mesma peça contada duas vezes no mesmo bloco.
export function destinosFinais(blocos) {
  if (blocos.some(b=>b.fracoes?.length)) {
    // Uma aba antiga pode mandar movimentos inteiros antes de uma fração: preservar a ordem
    // permite ao servidor aplicar a última intenção sem inventar o tamanho da marca antiga.
    if (blocos.some(b=>!b.fracoes?.length)) return blocos;
    const porMarca=new Map();
    for(const b of blocos) for(const f of b.fracoes) {
      const chave=`${b.setor}|${f.id}`, fim=f.inicio+f.quantidade;
      const antigas=porMarca.get(chave)||[];
      const restantes=antigas.flatMap(a=>{
        const ate=a.inicio+a.quantidade;
        if(ate<=f.inicio||a.inicio>=fim)return [a];
        return [...(a.inicio<f.inicio?[{...a,quantidade:f.inicio-a.inicio}]:[]),
          ...(ate>fim?[{...a,inicio:fim,quantidade:ate-fim}]:[])];
      });
      porMarca.set(chave,[...restantes,{...f,setor:b.setor,recurso:b.recurso,dia:b.dia}]);
    }
    const grupos=new Map();
    for(const partes of porMarca.values()) for(const p of partes) {
      const chave=JSON.stringify([p.setor,p.recurso,p.dia]);
      if(!grupos.has(chave))grupos.set(chave,{setor:p.setor,recurso:p.recurso,dia:p.dia,ids:[],fracoes:[]});
      const b=grupos.get(chave);
      if(!b.ids.includes(p.id))b.ids.push(p.id);
      b.fracoes.push({id:p.id,inicio:p.inicio,quantidade:p.quantidade});
    }
    return [...grupos.values()];
  }
  const porPeca = new Map();
  for (const b of blocos) for (const id of b.ids) porPeca.set(`${b.setor}|${id}`, { ...b, id });
  const grupos = new Map();
  for (const b of porPeca.values()) {
    const chave = JSON.stringify([b.setor, b.recurso, b.dia]);
    if (!grupos.has(chave)) grupos.set(chave, { setor: b.setor, recurso: b.recurso, dia: b.dia, ids: [] });
    grupos.get(chave).ids.push(b.id);
  }
  return [...grupos.values()];
}
