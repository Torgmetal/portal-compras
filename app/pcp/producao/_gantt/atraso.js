// ─── ATRASO, E O EMPURRÃO QUE ELE CAUSA ────────────────────────────────────────────────────────
//
// ⚠ ATRASO É FATO, NÃO PALPITE: o dia já passou E ainda tem peça sem apontamento no Syneco. O custo
// que sobrou consome a bancada a partir de hoje, e é isso que empurra quem vinha atrás.
//
// ⚠ O EMPURRÃO NÃO GRAVA. Entra como alteração PENDENTE, igual a um arraste; quem grava continua
// sendo o "Salvar programação". Foi a escolha do Vitor (05/09/2026) em vez de o portal reescrever
// datas sozinho — programação invisível foi o que escondeu 87 conjuntos da Larissa em 04/09.
//
// ⚠ UM LUGAR SÓ PARA A DECISÃO. Vitor: "o problema é como isso iria funcionar na tela dela para não
// ficar um monte de botão". Nenhum botão novo nas barras: conviver com o atraso já tem gesto
// (arrastar), e o atalho de fazer isso de uma vez mora na barra de ferramentas.
//
// ⚠ lê `getLotes()` (estado vivo), não uma cópia: depois de um arraste o atraso muda, e um botão
// congelado no carregamento mandaria empurrar o que já foi resolvido.

export function criarAtraso(dep){

  /* ── atraso e o empurrão que ele causa ──────────────────────────────────────
     ⚠ ATRASO É FATO, NÃO PALPITE: dia já passou E ainda tem peça sem apontamento no Syneco. O custo
     que sobrou consome a bancada a partir de hoje, e é isso que empurra quem vinha atrás. O empurrão
     é sempre em dias ÚTEIS inteiros, porque bancada-dia é a unidade em que a fábrica programa. */
  const fracaoFeita = (l)=> l.pecas>0 ? Math.min(1, l.feitas/l.pecas) : 0;
  const loteAtrasado = (l)=> l.dia < dep.HOJE && l.pecas > l.feitas;
  function empurraoDoRecurso(setor, rec){
    const cap = dep.capDe(setor, rec); if(!cap) return 0;
    let pend = 0;
    for(const l of dep.getLotes()){
      if(l.setor!==setor || l.recurso!==rec || !loteAtrasado(l)) continue;
      pend += dep.custoLote(l) * (1 - fracaoFeita(l));
    }
    return pend > 0 ? Math.ceil(pend/cap) : 0;
  }

  /* ── o atraso e o empurrão que ele causa ────────────────────────────────────
     ⚠ UM LUGAR SÓ PARA A DECISÃO. Vitor (05/09/2026): "são decisões que o PCP vai analisar e irá
     decidir o que será feito, o problema é como isso iria funcionar na tela dela para não ficar um
     monte de botão e confuso para todos". Então nenhum botão novo nas barras: conviver com o atraso
     já tem gesto (arrastar), e o atalho de fazer isso de uma vez mora na barra de ferramentas, que
     já existe - aparece quando há atraso e some quando não há.
     ⚠ POR QUE NÃO NA FAIXA DE VENCIDO: ela foi removida de propósito em f1315a74, junto com o CSS
     `.aviso`. Ressuscitar a faixa só para pendurar um botão desfaria essa limpeza por baixo.
     ⚠ O EMPURRÃO NÃO GRAVA. Entra como alteração PENDENTE, igual a um arraste; quem grava continua
     sendo o "Salvar programação". Foi a escolha do Vitor em vez de o portal reescrever datas
     sozinho - programação invisível foi o que escondeu 87 conjuntos da Larissa em 04/09.
     ⚠ lê `dep.getLotes()` (estado vivo), não `LOTES`: depois de um arraste o atraso muda, e um botão
     congelado no carregamento mandaria empurrar o que já foi resolvido. */
  function recursosComEmpurrao(){
    const vistos = new Map();
    for(const l of dep.getLotes()){
      const k = l.setor+"|"+(l.recurso||"—");
      if(vistos.has(k)) continue;
      const d = empurraoDoRecurso(l.setor, l.recurso);
      if(d>0) vistos.set(k, { setor:l.setor, recurso:l.recurso, dias:d });
    }
    return [...vistos.values()];
  }
  function aplicarEmpurrao(){
    const porRec = new Map(recursosComEmpurrao().map(r=>[r.setor+"|"+(r.recurso||"—"), r.dias]));
    if(!porRec.size) return;
    /* ⚠ do dia mais longe para o mais perto: mover primeiro quem está atrás faria o lote pousar em
       cima de outro que ainda não saiu do lugar, e `mesclar` juntaria os dois. */
    const alvos = dep.montarRuns()
      .filter(r=>dep.DIAS[r.ini] >= dep.HOJE && porRec.get(r.setor+"|"+(r.recurso||"—")))
      .sort((a,b)=>b.ini-a.ini);
    for(const r of alvos){
      const d = porRec.get(r.setor+"|"+(r.recurso||"—"));
      const antes = r.lotes.map(l=>({...l, itens:l.itens}));
      /* mesma regra do arraste: cair no sábado escorrega para a segunda, e quem JÁ estava no fim de
         semana continua lá - o empurrão não é lugar de desfazer uma decisão de alguém. */
      const novos = r.lotes.map(l=>{
        const cru = Math.max(0, Math.min(dep.DIAS.length-1, dep.IDX.get(l.dia)+d));
        return dep.novoLote({ ...l, itens:l.itens, dia: dep.DIAS[dep.fdsISO(l.dia) ? cru : dep.encostaNoUtil(cru)] });
      });
      dep.registrar({ setor:r.setor, op:r.op, pecas:r.pecas, kg:r.kg,
        rotulo: '<b>'+dep.nomeRec(r.setor,r.recurso)+'</b> · <b>'+dep.dbr(dep.DIAS[r.ini])+'</b><span class="seta">→</span>'
              + '<b>'+dep.dbr(dep.DIAS[Math.min(dep.DIAS.length-1, r.ini+d)])+'</b> · atraso',
        antes, novos });
    }
    dep.redesenhar();
  }
  function pintarEmpurrao(){
    const b = dep.$("empurrar"); if(!b) return;
    const recs = recursosComEmpurrao();
    if(!recs.length){ b.hidden = true; return; }
    b.hidden = false;
    b.textContent = "Empurrar o que vem depois (+"+Math.max(...recs.map(r=>r.dias))+" d)";
    b.title = "o atraso consome " + recs.map(r=>dep.nomeRec(r.setor,r.recurso)+": +"+r.dias+"d").join(" · ")
            + "\nentra como alteração pendente — só o Salvar grava";
  }

  return { fracaoFeita, loteAtrasado, empurraoDoRecurso, recursosComEmpurrao,
           aplicarEmpurrao, pintarEmpurrao };
}
