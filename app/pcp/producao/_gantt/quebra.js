// ─── QUEBRAR A PROGRAMAÇÃO EM BANCADAS × DIAS ──────────────────────────────────────────────────
//
// ⚠ EQUILIBRA TRABALHO, NÃO PESO NEM CONTAGEM. O conjunto mais caro entra primeiro, sempre na
// bancada-dia mais livre, descontando o que aquela célula já tem de OUTRAS OPs. Repartir "metade do
// peso para cada" empata por acaso e entrega a obra na mão errada.
//
// ⚠ O ESTADO DA ABA MORA AQUI (quais bancadas e quantos dias). Só o `abrirPainel` precisa mexer
// nele, e faz isso por `reiniciar(r)` — não é estado do quadro.
//
// ⚠ RECEBE `dep`, NÃO O ESTADO. As funções de `iniciar` (ocup, carga, custoItem, registrar…) já
// fecham sobre `lotes` e `regua`; passar as FUNÇÕES em vez das variáveis é o que permite este
// módulo existir sem duplicar a verdade sobre o que está programado.

export function criarQuebra(dep){
  let bancadas = null, dias = 1;

  /** o painel abriu noutra programação: a escolha volta ao padrão daquela barra */
  function reiniciar(r){ bancadas = null; dias = r.dias; }

  const cargaRestante = (r, recurso, dia, meus) => (r.restantes || [])
    .filter(l=>meus.has(l.uid) && l.recurso===recurso && l.dia===dia)
    .flatMap(l=>l.itens).reduce((s,i)=>s+dep.custoItem(i,r.setor),0);

  function pintarQuebra(r){
    if(!r.itens.length){ dep.$("pCorpo").innerHTML='<div class="dica">Nenhum item selecionado. Volte a Projetos programados e ajuste os filtros.</div>'; dep.$("pFoot").innerHTML=''; return; }
    const recs = dep.RECURSOS[r.setor].filter(x=>x.k);
    const cortePorMaquina = r.setor==="CORTE";   // no corte a máquina é UMA só
    if(bancadas===null) bancadas = new Set(r.recurso ? [r.recurso] : []);
    let h = '<div class="dica"><b>'+r.itens.length+' marca(s) · '+r.pecas+' peças selecionadas</b>. '+(r.parcial?'As demais peças permanecem na programação original.':'Divisão de todos os itens exibidos.')+'</div><div class="bloco"><h4>'+(cortePorMaquina?"Máquina":"Bancadas que vão receber")+'</h4><div class="chips">';
    const meus = new Set(r.lotes.map(l=>l.uid));
    for(const x of recs){
      let o = 0;
      for(const i of dep.diasDaQuebra(r.ini, dias)) o = Math.max(o, dep.ocup(r.setor, x.k, dep.DIAS[i], meus) + cargaRestante(r,x.k,dep.DIAS[i],meus)/dep.capDe(r.setor,x.k));
      h += '<button class="chip'+(bancadas.has(x.k)?" on":"")+'" data-b="'+x.k+'">'+x.nome
        + ' <small class="'+dep.classeOc(o)+'">'+(o>0?dep.rotuloOc(o):"livre")+'</small></button>';
    }
    h += '</div><div class="dica" style="padding:8px 0 0;background:none">'
      + (cortePorMaquina
          ? '<b>No corte, cada seleção vai para uma máquina.</b> Escolha a máquina compatível com o perfil — chapa não vai '
            + 'para o laser de tubo. A divisão pode <b>espalhar por mais dias</b> na máquina escolhida; trocar a máquina de peças '
            + 'específicas pode ser feita selecionando o perfil em Projetos programados e escolhendo a máquina aqui.'
          : 'A porcentagem é o pior dia que a bancada <b>já tem</b> no período de outras programações — a divisão desconta '
            + 'isso antes de repartir.')
      + '</div></div>';
    h += '<div class="bloco"><h4>Em quantos dias</h4>'
      + '<div style="display:flex;align-items:center;gap:9px">'
      + '<input class="num-in" type="number" min="1" max="15" id="gp-qDias" value="'+dias+'">'
      + '<span style="color:#5b6a7d;font-size:11.5px">a partir de <b>'+dep.dbr(dep.DIAS[r.ini])+'</b>'
      + (dep.fdsISO(dep.DIAS[r.ini]) ? ' · dias corridos, incluindo o fim de semana' : ' · pulando sábado e domingo')+'</span>'
      + '<button class="btn mini" id="gp-qAuto" style="margin-left:auto">Achar o que cabe</button></div></div>';

    const alvos = [...bancadas];
    const plano = fatiar(r, alvos, dias);
    const piorDe = (pl)=>{ const c = pl.slots.filter(s=>s.itens.length).map(s=>(s.base+s.carga)/s.cap);
                           return c.length ? Math.max(...c) : 0; };
    if(!plano){
      h += '<div class="dica" style="color:#a01c1c"><b>Escolha '+(cortePorMaquina?"a máquina":"ao menos uma bancada")+' acima.</b>'
        + (r.recurso ? '' : ' Esta programação ainda está sem '+(cortePorMaquina?"máquina":"bancada")+' definida.')+'</div>';
      dep.$("pCorpo").innerHTML = h;
      dep.$("pFoot").innerHTML = '<button class="btn pri" disabled>Aplicar divisão</button>';
    } else {
      h += '<div class="bloco"><h4>Como ficaria</h4><table class="prev"><thead><tr>'
        + '<th>'+(cortePorMaquina?"Máquina":"Bancada")+'</th><th>Dia</th><th style="text-align:right">Peças</th>'
        + '<th style="text-align:right">kg</th><th style="text-align:right">Ocupação</th></tr></thead><tbody>';
      for(const s of plano.slots.filter(s=>s.itens.length)){
        const o = (s.base + s.carga) / s.cap;
        h += '<tr><td class="b">'+dep.nomeRec(r.setor,s.recurso)+'</td><td>'+dep.dbr(s.dia)+'</td>'
          + '<td style="text-align:right">'+s.itens.reduce((a,i)=>a+i.q,0)+'</td>'
          + '<td style="text-align:right">'+dep.nkg(s.itens.reduce((a,i)=>a+i.kg,0))+'</td>'
          + '<td style="text-align:right" class="oc '+dep.classeOc(o)+'">'+dep.rotuloOc(o)+'</td></tr>';
      }
      h += '</tbody></table>';
      const pior = piorDe(plano);
      const cheias = plano.slots.filter(s=>!s.itens.length && s.base >= s.cap);
      h += '<div class="dica" style="padding:9px 0 0;background:none">'
        + (pior>1 ? '⚠ Mesmo dividido, o pior dia fica em <b>'+Math.round(pior*100)+'%</b>. Aumente os dias ou some outra bancada.'
                  : 'Nenhum dia passa de 100% — a divisão cabe.')
        + (cheias.length ? '<br>'+cheias.length+' bancada-dia ficou de fora por já estar cheia com outra programação: '
            + cheias.slice(0,4).map(s=>'<b>'+dep.nomeRec(r.setor,s.recurso)+' '+dep.dbr(s.dia)+'</b> ('+Math.round(s.base/s.cap*100)+'%)').join(", ")
            + (cheias.length>4 ? " e mais "+(cheias.length-4) : "") : "")
        + '</div></div>';
      h += '<div class="dica">A divisão usa a mesma regra do portal: <b>o conjunto mais caro entra primeiro</b>, sempre na '
        + 'bancada-dia mais livre. Equilibra <b>trabalho</b> (dias-bancada), não peso nem contagem — repartir "metade do peso '
        + 'para cada" empata por acaso e entrega a obra na mão errada.</div>';
      dep.$("pCorpo").innerHTML = h;
      dep.$("pFoot").innerHTML =
          '<div class="info">'+r.pecas+' peças · hoje em <b>'+r.dias+' dia(s)</b> '
        + (r.recurso ? 'na '+dep.nomeRec(r.setor,r.recurso) : 'sem '+(cortePorMaquina?"máquina":"bancada"))
        + ' <span class="seta">→</span> passariam a ocupar <b>'+plano.usados+' '
        + (cortePorMaquina?"dia(s)":"bancada-dia(s)")+'</b>.</div>'
        + '<button class="btn pri" id="gp-aplicar">Aplicar divisão</button>';
      dep.$("aplicar").onclick = ()=>aplicarQuebra(r, plano, cortePorMaquina);
    }
    for(const c of dep.raiz.querySelectorAll("#gp-pCorpo .chip"))
      c.onclick = ()=>{ const b=c.dataset.b;
        if(cortePorMaquina){ bancadas = bancadas.has(b) ? new Set() : new Set([b]); }
        else if(bancadas.has(b)) bancadas.delete(b); else bancadas.add(b);
        dep.pintarPainel(); };
    const qd = dep.$("qDias");
    if(qd) qd.onchange = ()=>{ dias = Math.max(1, Math.min(15, +qd.value||1)); dep.pintarPainel(); };
    const qa = dep.$("qAuto");
    if(qa) qa.onclick = ()=>{
      const bcs = [...bancadas];
      let escolhido = null, melhorPior = Infinity, melhorD = 1;
      for(let d=1; d<=15; d++){
        const pl = fatiar(r, bcs, d); if(!pl) break;
        const pior = piorDe(pl);
        if(pior < melhorPior - 1e-6){ melhorPior = pior; melhorD = d; }
        if(pior <= 1.0001){ escolhido = d; break; }
      }
      dias = escolhido || melhorD;
      dep.pintarPainel();
    };
  }

  /* reparte os itens do run entre (bancadas × dias), descontando o que a célula já tem de OUTRAS OPs */
  function fatiar(r, bancadas, nDias){
    bancadas = bancadas.filter(b=>b && dep.capDe(r.setor, b) > 0);
    if(!bancadas.length) return null;
    const meus = new Set(r.lotes.map(l=>l.uid));
    const slots = [];
    const cols = dep.diasDaQuebra(r.ini, nDias);
    for(const b of bancadas) for(const i of cols){
      const dia = dep.DIAS[i];
      const cap = dep.capDe(r.setor, b);
      slots.push({ recurso:b, dia, cap, base: dep.carga(r.setor, b, dia, meus) + cargaRestante(r,b,dia,meus), carga:0, itens:[] });
    }
    const ord = [...r.itens].sort((a,b)=>dep.custoItem(b,r.setor)-dep.custoItem(a,r.setor));
    for(const it of ord){
      let alvo = slots[0], livre = -Infinity;
      for(const s of slots){ const l = s.cap - s.base - s.carga; if(l > livre + 1e-9){ livre = l; alvo = s; } }
      alvo.itens.push(it); alvo.carga += dep.custoItem(it, r.setor);
    }
    return { slots, usados: slots.filter(s=>s.itens.length).length };
  }

  function aplicarQuebra(r, plano, cortePorMaquina){
    const antes = r.lotes.map(l=>({...l, itens:l.itens}));
    const novos = plano.slots.filter(s=>s.itens.length).map(s=>dep.novoLote({
      setor:r.setor, recurso:s.recurso, dia:s.dia, op:r.op, obra:r.obra,
      recursoOrig: antes[0].recursoOrig, diaOrig: antes[0].diaOrig, adiado: r.adiado,
      itens: s.itens, pecas:0, kg:0, custo:0, feitas:0,
    }));
    const nB = new Set(novos.map(n=>n.recurso)).size, nD = new Set(novos.map(n=>n.dia)).size;
    dep.registrar({
      setor:r.setor, op:r.op, pecas:r.pecas, kg:r.kg, antes, novos, parcial:r.parcial,
      rotulo: '<b>quebrada</b> em <b>'+nB+' '+(cortePorMaquina?"máquina":"bancada")+(nB>1?"s":"")+'</b> × <b>'+nD+' dia'+(nD>1?"s":"")+'</b>'
            + ' <span class="de-para">('+dep.dbr(novos[0].dia)+' a '+dep.dbr(novos[novos.length-1].dia)+')</span>',
    });
    dep.esconderPainel();
    dep.redesenhar();
  }

  return { reiniciar, pintarQuebra, fatiar, aplicarQuebra };
}
