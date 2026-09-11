/** Identidade das faixas é a unidade da LPC; nunca representa uma nova peça física. */
const diaISO = d => d ? new Date(d).toISOString().slice(0,10) : null;
export function partesAtuais(p, campos, distribuicao) {
  const quantidade = Math.max(1,p.qte || 1);
  if (distribuicao && distribuicao.quantidade === quantidade &&
      diaISO(distribuicao.ancoraDia) === diaISO(p[campos.dia]) &&
      (distribuicao.ancoraRecurso || null) === (p[campos.recurso] || null)) return distribuicao.partes;
  return [{inicio:0,quantidade,dia:diaISO(p[campos.dia]),recurso:p[campos.recurso] || null}];
}
export function moverFaixa(partes, faixa, total) {
  const {inicio,quantidade}=faixa;
  if (!Number.isInteger(inicio) || !Number.isInteger(quantidade) || inicio<0 || quantidade<1 || inicio+quantidade>total)
    throw new Error('Quantidade ou faixa inválida. Atualize o quadro.');
  const fim=inicio+quantidade;
  const saida=[];
  for(const p of partes){
    const pf=p.inicio+p.quantidade;
    if(pf<=inicio || p.inicio>=fim) saida.push({...p});
    else {
      if(p.inicio<inicio) saida.push({...p,quantidade:inicio-p.inicio});
      if(pf>fim) saida.push({...p,inicio:fim,quantidade:pf-fim});
    }
  }
  saida.push({inicio,quantidade,dia:faixa.dia || null,recurso:faixa.recurso || null});
  saida.sort((a,b)=>a.inicio-b.inicio);
  const juntas=[];
  for(const p of saida){const ant=juntas.at(-1);if(ant && ant.inicio+ant.quantidade===p.inicio && ant.dia===p.dia && ant.recurso===p.recurso)ant.quantidade+=p.quantidade;else juntas.push(p);}
  return juntas;
}
export function expandirPeca(p,campos,distribuicao,feito=0){
  let saldo=Math.max(0,Math.min(feito,Math.max(1,p.qte||1)));
  return [...partesAtuais(p,campos,distribuicao)].sort((a,b)=>(a.dia||'9999').localeCompare(b.dia||'9999') || a.inicio-b.inicio).map(parte=>{
    const f=Math.min(saldo,parte.quantidade);saldo-=f;
    return {...p,[campos.dia]:parte.dia,[campos.recurso]:parte.recurso,inicioUnidade:parte.inicio,
      qTotal:Math.max(1,p.qte||1),qte:parte.quantidade,pesoTotalKg:(p.pesoTotalKg||0)*parte.quantidade/Math.max(1,p.qte||1),feitoDistribuido:f};
  });
}
