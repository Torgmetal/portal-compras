// ─── LOTES, BARRAS E OCUPAÇÃO ──────────────────────────────────────────────────────────────────
//
// ⚠ A UNIDADE É O LOTE: setor + recurso + OP + dia. É assim que a fábrica enxerga ("a 097 na
// montagem 1 na quarta") e é o menor bloco que faz sentido arrastar inteiro.
//
// ⚠ A BARRA NUNCA ATRAVESSA O FIM DE SEMANA — dias seguidos viram uma barra só, mas o sábado corta.
// Uma barra por cima do sábado PARECE trabalho no sábado, e num quadro de produção o desenho é a
// informação. E `r.dias` conta dias TRABALHADOS, não colunas: quem atravessa o fim de semana cobre
// 4 colunas e trabalha 2 dias.
//
// ⚠ OCUPAÇÃO É DA BANCADA NAQUELE DIA, não progresso da OP — foi essa confusão que fez o "532%"
// parecer sem sentido. Acima da capacidade a leitura vira múltiplo ("5,3×").

export function criarLotes(dep){

  /* junta dep.getLotes() que ficaram no mesmo setor/recurso/OP/dia depois de um remanejo ou de uma quebra */
  function mesclar(){
    const por = new Map();
    const fora = [];
    for(const l of dep.getLotes()){
      const k = l.setor+"|"+(l.recurso||"—")+"|"+l.op+"|"+l.dia;
      const a = por.get(k);
      if(!a){ por.set(k,l); fora.push(l); continue; }
      a.itens = a.itens.concat(l.itens);
      a.pecas += l.pecas; a.kg += l.kg; a.custo += l.custo; a.feitas += l.feitas;
      a.adiado = Math.max(a.adiado, l.adiado||0);
    }
    dep.setLotes(fora);
  }
  const recalc = (l)=>{
    l.pecas = l.itens.reduce((s,i)=>s+i.q,0);
    l.kg = Math.round(l.itens.reduce((s,i)=>s+i.kg,0));
    l.custo = Math.round(l.itens.reduce((s,i)=>s+i.c,0)*100)/100;
    l.feitas = l.itens.reduce((s,i)=>s+(i.f||0),0);
    return l;
  };

  /* ── runs (dias seguidos da mesma OP no mesmo recurso = 1 barra) ────────────── */
  function montarRuns(){
    const grupos = new Map();
    for(const l of dep.getLotes()){
      if(!dep.getSetoresOn().has(l.setor)) continue;
      const k = l.setor+"|"+(l.recurso||"—")+"|"+l.op;
      if(!grupos.has(k)) grupos.set(k,[]);
      grupos.get(k).push(l);
    }
    const runs=[];
    for(const arr of grupos.values()){
      arr.sort((a,b)=>a.dia.localeCompare(b.dia));
      let atual=null;
      for(const l of arr){
        const i = dep.IDX.get(l.dia); if(i==null) continue;
        // ⚠ A BARRA NUNCA ATRAVESSA O FIM DE SEMANA. Matheus (05/09/2026): "o certo é que
        // a barra se divida em duas caso estiver programado para sex, seg, ter". Houve uma
        // versão que costurava o vão para não perder o bloco único de arrastar; era o
        // raciocínio errado — uma barra por cima do sábado PARECE trabalho no sábado, e num
        // quadro de produção o desenho é a informação.
        if(atual && i === atual.fim+1){ atual.fim=i; atual.lotes.push(l); }
        else { atual={ setor:l.setor, recurso:l.recurso, op:l.op, obra:l.obra, ini:i, fim:i, lotes:[l] }; runs.push(atual); }
      }
    }
    for(const r of runs){
      r.id = r.setor+"|"+(r.recurso||"—")+"|"+r.op+"|"+r.ini;
      // dias TRABALHADOS, não colunas ocupadas: uma barra que atravessa o fim de
      // semana cobre 4 colunas e trabalha 2 dias. Contar coluna diria "4 dias" e
      // ainda entraria como padrão na quebra.
      r.dias = new Set(r.lotes.map(l=>l.dia)).size;
      r.pecas = r.lotes.reduce((s,l)=>s+l.pecas,0);
      r.kg = r.lotes.reduce((s,l)=>s+l.kg,0);
      r.feitas = r.lotes.reduce((s,l)=>s+l.feitas,0);
      r.custo = r.lotes.reduce((s,l)=>s+dep.custoLote(l),0);
      r.itens = r.lotes.flatMap(l=>l.itens);
      r.semGrd = r.itens.filter(i=>!i.g).length;
      r.mexida = r.lotes.some(l=>l.recurso!==l.recursoOrig || l.dia!==l.diaOrig);
      r.adiado = Math.max(0, ...r.lotes.map(l=>l.adiado||0));
    }
    return runs;
  }
  const acharRun = (chave)=> chave ? montarRuns().find(r=>r.setor===chave.setor && r.recurso===chave.recurso
      && r.op===chave.op && r.ini===chave.ini) : null;

  /* ── carga por célula ───────────────────────────────────────────────────────── */
  function carga(setor, recurso, dia, ignorarUids){
    let c = 0;
    for(const l of dep.getLotes()){
      if(l.setor!==setor || l.recurso!==recurso || l.dia!==dia) continue;
      if(ignorarUids && ignorarUids.has(l.uid)) continue;
      c += dep.custoLote(l);
    }
    return c;
  }
  const ocup = (setor, recurso, dia, ign)=>{ const cap = dep.capDe(setor,recurso); return cap ? carga(setor,recurso,dia,ign)/cap : 0; };
  const classeOc = (o)=> o<=0 ? "" : o<=1 ? "q1" : o<=1.3 ? "q2" : "q3";
  /* ⚠ "532%" não diz nada sobre UM dia. Vitor (05/09/2026): "não entendi essa lógica". Acima da
     capacidade a leitura vira múltiplo - "5,3×" = cinco dias e meio de bancada empilhados num dia só. */
  const rotuloOc = (o)=> o<=1 ? Math.round(o*100)+"%"
                              : (Math.round(o*10)/10).toLocaleString("pt-BR")+"×";

  return { mesclar, recalc, montarRuns, acharRun, carga, ocup, classeOc, rotuloOc };
}
