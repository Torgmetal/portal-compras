// ─── O DESENHO DA GRADE ────────────────────────────────────────────────────────────────────────
//
// ⚠ HTML EM STRING, DE PROPÓSITO. São centenas de barras posicionadas em pixel, redesenhadas a cada
// pointermove do arraste. Reconstruir isto com estado do React re-renderizaria a grade inteira a
// cada movimento — ver o cabeçalho de GanttProgramacao.jsx.
//
// ⚠ A BARRA NÃO VEM PREENCHIDA: contorno + fundo esmaecido = PROGRAMADO; a faixa sólida embaixo é o
// que o Syneco já apontou. Vermelho é só ATRASO — sobrecarga é hachura âmbar na régua de baixo.
//
// ⚠ A SOMBRA TRACEJADA É PREVISÃO, NÃO PROGRAMAÇÃO: onde a OP cai se o atraso não for recuperado.
// Nada disso está no banco. Desenhar direto no lugar novo faria a tela mentir sobre o que está
// gravado — foi essa confusão que escondeu 87 conjuntos da Larissa em 04/09/2026.
//
// ⚠ O estado (inicio, painel, setoresOn) entra por GETTER: `desenhar` é chamado de dezenas de
// lugares e sempre tem de ler o valor de agora, não o da montagem.

export function criarGrade(dep){

  function sombrasDoEmpurrao(runs, emp, inicio, larg){
    if(!emp) return "";
    let h = "";
    for(const r of runs){
      if(dep.DIAS[r.ini] < dep.HOJE) continue;
      const ni = r.ini+emp, nf = r.fim+emp;
      if(nf<inicio || ni>=inicio+larg) continue;
      const a = Math.max(ni,inicio), b = Math.min(nf, inicio+larg-1);
      const x = (a-inicio)*dep.COL+3, w = (b-a+1)*dep.COL-7;
      h += '<div class="sombra" style="left:'+x+'px;width:'+w+'px;top:'+(r.faixa*30+5)+'px;'
        +  '--c:'+dep.corDaOp(r.op)+';--ct:'+dep.tintaOp(r.op)+'" title="OP-'+r.op+' cai aqui se o atraso '
        +  'não for recuperado ('+emp+' dia útil'+(emp>1?'s':'')+' de empurrão)">'
        +  (w>=90?'<b>OP-'+r.op+' →</b>':'')+'</div>';
    }
    return h;
  }

  /* ── desenho da dep.grade ───────────────────────────────────────────────────────── */
  function desenhar(){
    const runs = dep.montarRuns();
    const janela = dep.DIAS.slice(dep.getInicio(), dep.getInicio()+dep.JANELA);
    const larg = janela.length;
    let html = '<div class="linha cabdia"><div class="rotulo">Setor / recurso</div><div class="trilho" style="width:'+(larg*dep.COL)+'px"><div class="celulas">';
    for(const s of janela){
      const d=dep.d0(s);
      html += '<div class="dia'+(s===dep.HOJE?" hoje":"")+(dep.fdsISO(s)?" fds":"")+'"><div class="dsem">'+dep.DSEM[d.getUTCDay()]+'</div>'
           +  '<div class="dnum">'+String(d.getUTCDate()).padStart(2,"0")+'</div>'
           +  '<div class="dmes">'+dep.MES[d.getUTCMonth()]+'</div></div>';
    }
    html += '</div></div></div>';

    for(const setor of dep.SETORES){
      if(!dep.getSetoresOn().has(setor)) continue;
      const doSetor = runs.filter(r=>r.setor===setor);
      const pc = doSetor.reduce((s,r)=>s+r.pecas,0), kg = doSetor.reduce((s,r)=>s+r.kg,0);
      const temNaJanela = doSetor.some(r=>r.fim>=dep.getInicio() && r.ini<dep.getInicio()+larg);
      const e = dep.estado.get(setor);
      const aberto = e ? e==="a" : temNaJanela;
      const resumo = doSetor.length
        ? doSetor.length+' programações · '+pc.toLocaleString("pt-BR")+' peças · '+dep.nkg(kg)+' kg'
          + (temNaJanela ? "" : ' — <b>nada nesta janela</b>')
        : 'sem programação';
      html += '<div class="setor" data-toggle="'+setor+'"><div class="rotulo"><span class="caret">'+(aberto?"▼":"►")+'</span>'
           +  '<b>'+setor+'</b></div><div class="resumo">'+resumo+'</div></div>';
      if(!aberto) continue;

      for(const rec of dep.RECURSOS[setor]){
        const meus = doSetor.filter(r=>r.recurso===rec.k).sort((a,b)=>a.ini-b.ini||b.fim-a.fim);
        const faixas=[];
        for(const r of meus){
          let f = faixas.findIndex(x=>x < r.ini);
          if(f<0){ f=faixas.length; faixas.push(-1); }
          faixas[f]=r.fim; r.faixa=f;
        }
        const visiveis = meus.filter(r=>r.fim>=dep.getInicio() && r.ini<dep.getInicio()+larg);
        const naJanela = visiveis.length;
        const emp = dep.empurraoDoRecurso(setor, rec.k);
        /* ⚠⚠ A ALTURA SAI DO QUE ESTÁ NA JANELA, não de todas as faixas do recurso. Vitor
           (09/09/2026): "o jato deve estar com algum problema, ele está ficando em aberto, uma
           página enorme". `faixas` empilha TODO lote que se sobrepõe no tempo, inclusive o que está
           semanas à frente: 65 previsões de terceiro no mesmo dia 25/09 davam 65 faixas e
           65×30+24 = 1.974px de linha vazia, com quatro blocos aparecendo na tela.
           A causa principal era a previsão emitir um lote por marca (corrigido em
           lib/terceiros-previsao), mas a altura precisa se defender sozinha: um dia cheio de lotes
           reais fora da janela derrubaria a página do mesmo jeito. */
        const faixasVisiveis = visiveis.length ? Math.max(...visiveis.map(r=>r.faixa)) + 1 : 1;
        const alt = naJanela ? Math.max(1,faixasVisiveis)*30 + 8 + 16 : 38;
        html += '<div class="linha'+(rec.k?"":" pousio")+'" data-setor="'+setor+'" data-rec="'+(rec.k||"")+'" '
             +  'data-row="'+setor+'|'+(rec.k||"")+'" style="min-height:'+alt+'px">';
        /* ⚠⚠ A LISTA DO POSTO SAI DAQUI. Vitor (08/09/2026): "na frente do nome do montador, uma
           opção para imprimir a lista completa do que está no nome dele, por dia ou semana".
           Vale para qualquer posto COM chave — o laser e o galpão têm a mesma pergunta. A linha
           "sem bancada" não tem: ali ninguém é dono de nada, é fila esperando decisão. */
        html += '<div class="rotulo"><b>'+rec.nome+'</b>'
             +  (rec.k?'<span class="lista"><button class="mini" data-lista="dia" data-setor="'+setor+'" data-rec="'+rec.k+'" data-nome="'+rec.nome+'" title="lista de hoje">dia</button>'
                      +'<button class="mini" data-lista="semana" data-setor="'+setor+'" data-rec="'+rec.k+'" data-nome="'+rec.nome+'" title="lista da semana">semana</button></span>':'')
             +  (rec.obs?'<small>'+rec.obs+'</small>':(rec.cap>1?'<small>meta '+dep.nkg(rec.cap)+' kg/dia</small>':'<small>1 bancada-dia</small>'))+'</div>';
        html += '<div class="trilho" style="width:'+(larg*dep.COL)+'px"><div class="celulas">';
        for(const s of janela) html += '<div class="cel'+(dep.fdsISO(s)?" fds":"")+'" data-dia="'+s+'"></div>';
        html += '</div><div class="barras">';
        for(const r of meus){
          if(r.fim<dep.getInicio() || r.ini>=dep.getInicio()+larg) continue;
          const a = Math.max(r.ini,dep.getInicio()), b = Math.min(r.fim, dep.getInicio()+larg-1);
          const x = (a-dep.getInicio())*dep.COL+3, w = (b-a+1)*dep.COL-7;
          const cabe = w >= 200, dias = r.dias, pend = r.pecas-r.feitas;
          const fr = r.pecas>0 ? Math.min(1, r.feitas/r.pecas) : 0;
          /* a parte da barra que já venceu e não foi apontada */
          const atrasados = r.lotes.filter(dep.loteAtrasado);
          const atrasoAte = atrasados.length ? Math.max(...atrasados.map(l=>dep.IDX.get(l.dia))) : -1;
          const larguraAtraso = atrasoAte>=0 ? ((Math.min(atrasoAte,b)-a+1)/(b-a+1))*100 : 0;
          /* ⚠ sábado e domingo passaram a ter coluna (71cef05a), então `dep.DIAS` já não é só dia útil:
             o atraso desconta o fim de semana. Sem isso o que venceu na sexta apareceria como 3 dias
             de atraso na segunda, e a fábrica não trabalhou nesses dois. */
          const diasAtraso = atrasoAte>=0
            ? dep.DIAS.slice(Math.min(...atrasados.map(l=>dep.IDX.get(l.dia))))
                  .filter(d=>d<dep.HOJE && !dep.fdsISO(d)).length : 0;
          const foco = dep.getPainel() && dep.getPainel().setor===r.setor && dep.getPainel().recurso===r.recurso && dep.getPainel().op===r.op && dep.getPainel().ini===r.ini;
          const bloqueados = r.setor==='MONTAGEM' && !r.terceiroRecebido ? r.itens.filter(i=>i.prontidao?.pronto!==true).length : 0;
          const dica = "OP-"+r.op+(r.familia?" · "+r.familia:"")+(r.obra?" — "+r.obra:"")+"\n"+rec.nome+" · "
            + (dias>1 ? dep.dbr(dep.DIAS[r.ini])+" a "+dep.dbr(dep.DIAS[r.fim])+" ("+dias+" dias)" : dep.dbr(dep.DIAS[r.ini]))
            + "\n"+r.pecas+" peças · "+dep.nkg(r.kg)+" kg"
            + "\nSyneco apontou "+r.feitas+" de "+r.pecas+" ("+Math.round(fr*100)+"%)"
            + (diasAtraso>0 ? "\n⚠ atrasada "+diasAtraso+" dia(s) úteis — "+pend+" peça(s) pendentes" : "")
            + (r.semGrd ? "\n"+r.semGrd+" projeto(s) ainda sem GRD impressa" : "\nprojetos todos impressos")
            + (bloqueados ? '\n! '+bloqueados+' conjunto(s) com croqui/corte pendente. '+(r.itens.length-bloqueados)+' apto(s) para liberação parcial.' : '')
            + "\n\nclique para ver os projetos · arraste para remanejar";
          html += '<div class="barra-op'+(bloqueados?' croquis-pendentes':'')+(r.terceiroPrevisto?" terceiro-previsto":"")+(r.mexida?" mexida":"")+(foco?" foco":"")+(diasAtraso>0?" atrasada":"")+'" data-run="'+r.id+'" '
               +  'title="'+dica.replace(/"/g,"&quot;")+'" style="left:'+x+'px;width:'+w+'px;top:'+(r.faixa*30+5)+'px;'
               +  '--c:'+dep.corDaOp(r.op)+';--ct:'+dep.tintaOp(r.op)+'">'
               +  (fr>0?'<div class="prog" style="width:'+(fr*100).toFixed(1)+'%"></div>':"")
               +  (larguraAtraso>0?'<div class="atrasado" style="width:'+larguraAtraso.toFixed(1)+'%"></div>':"")
               +  (bloqueados?'<b class="alerta-croqui" aria-label="Croquis pendentes">!</b>':'')
               +  '<b>OP-'+r.op+'</b><span>'+(bloqueados ? (r.itens.length-bloqueados)+'/'+r.itens.length+' aptos' : r.terceiroPrevisto ? 'Aguardando terceiro' : r.terceiroRecebido ? 'Retorno recebido · '+r.pecas+' pç' : cabe ? r.pecas+' pç · '+dep.nkg(r.kg)+' kg' : r.pecas+' pç')+'</span>'
               +  (cabe && diasAtraso>0?'<span class="selo atr">atrasada '+diasAtraso+' d</span>':"")
               +  (cabe && r.adiado>0?'<span class="selo">adiada '+r.adiado+'×</span>':"")
               +  (cabe && r.feitas>0?'<span class="selo">'+Math.round(fr*100)+'% · '+pend+' a fazer</span>':"")
               +  (r.semGrd?'<div class="semgrd" title="'+r.semGrd+' sem GRD"></div>':"")
               +  (r.ini<dep.getInicio()?'<div class="corta e">◀</div>':"")+(r.fim>dep.getInicio()+larg-1?'<div class="corta d">▶</div>':"")
               +  '</div>';
        }
        /* ⚠ SOMBRA = PREVISÃO, NÃO PROGRAMAÇÃO. Onde a OP cai se o atraso não for recuperado. Nada
           disso está no banco: vira alteração pendente só quando o PCP aplicar, e programação só
           depois do "Salvar". Desenhar direto no lugar novo faria a tela mentir sobre o que está
           gravado - foi exatamente essa confusão que escondeu 87 conjuntos da Larissa em 04/09. */
        html += sombrasDoEmpurrao(meus, emp, dep.getInicio(), larg);
        html += '</div>'+(naJanela?'<div class="cargas">':'<div class="cargas" hidden>');
        for(const s of janela){
          const o = dep.ocup(setor, rec.k, s);
          html += '<div class="cg '+dep.classeOc(o)+(dep.fdsISO(s)?" fds":"")+'">'
               +  (o>0 ? '<div class="f" style="width:'+Math.min(100,o*100)+'%"></div>' : "")
               +  (o>=0.005 ? '<span>'+dep.rotuloOc(o)+'</span>' : "")+'</div>';
        }
        html += '</div></div></div>';
      }
    }
    dep.grade.innerHTML = html;
    dep.$("periodo").textContent = dep.dbr(janela[0])+" a "+dep.dbr(janela[larg-1])+" · "+dep.d0(janela[0]).getUTCFullYear();
    for(const el of dep.grade.querySelectorAll(".barra-op")) el.addEventListener("pointerdown", dep.pegar());

    /* ⚠ a lista do posto: "dia" é hoje, "semana" é a semana de hoje (segunda a domingo). Ancorar na
       janela visível seria mais esperto e menos previsível — quem clica quer o que o montador tem
       para hoje, não o que aparece na tela depois de rolar. */
    for(const b of dep.grade.querySelectorAll("[data-lista]")) b.onclick = async (ev)=>{
      ev.stopPropagation();
      const per = b.dataset.lista, hoje = dep.HOJE || new Date().toISOString().slice(0,10);
      let de = hoje, ate = hoje;
      if(per === "semana"){
        const d = new Date(hoje+"T12:00:00Z"), w = d.getUTCDay();       // 0=dom
        const seg = new Date(d); seg.setUTCDate(d.getUTCDate() - ((w+6)%7));
        const dom = new Date(seg); dom.setUTCDate(seg.getUTCDate()+6);
        de = seg.toISOString().slice(0,10); ate = dom.toISOString().slice(0,10);
      }
      const antes = b.textContent; b.disabled = true; b.textContent = "…";
      try{ await dep.baixarListaPosto({ setor:b.dataset.setor, recurso:b.dataset.rec,
        nomePosto:b.dataset.nome, de, ate, periodo:per }); }
      catch(e){ dep.avisar(e?.message || "Falha ao gerar a lista", "erro"); }
      finally{ b.disabled = false; b.textContent = antes; }
    };
  }

  return { desenhar };
}
