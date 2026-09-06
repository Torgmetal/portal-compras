// ─── ABA "PROJETOS PROGRAMADOS" ────────────────────────────────────────────────────────────────
//
// ⚠ GRD = IMPRESSÃO. No portal não existe estado "liberado" separado da impressão: a GRD nasce
// quando o desenho é impresso, e reimprimir a mesma marca soma uma cópia no registro em vez de
// criar outra GRD. É por isso que "imprimir" aqui é uma ação de produção, não de papel.
//
// ⚠ A COLUNA "FEITO" E O TOTAL saem do MESMO campo que preenche a barra do Gantt (o apontamento do
// Syneco por marca). Se a coluna e a barra discordassem, uma das duas estaria mentindo.
//
// ⚠ O estado da aba (seleção e filtro) mora aqui; `abrirPainel` zera por `reiniciar()`.

export function criarPainelProjetos(dep){
  let sel = new Set(), soFalta = false;

  function reiniciar(){ sel = new Set(); soFalta = false; }

  function pintarProjetos(r){
    const itens = [...r.itens].sort((a,b)=> (a.g?1:0)-(b.g?1:0) || String(a.m).localeCompare(String(b.m)));
    const mostra = soFalta ? itens.filter(i=>!i.g) : itens;
    const teto = 300, corte = mostra.slice(0, teto);
    const semG = itens.filter(i=>!i.g).length;
    let h = '<div class="ptool">'
      + '<b style="color:#8a5600">'+semG+' marca(s) sem GRD</b> · <b style="color:#136c35">'+(itens.length-semG)+' já impressa(s)</b>'
      + '<label><input type="checkbox" id="gp-fSemGrd"'+(soFalta?" checked":"")+'> só os não impressos</label>'
      + '<button class="btn mini" id="gp-selTodos">Selecionar '+(soFalta?"os listados":"todos")+'</button>'
      + '<button class="btn mini" id="gp-selNenhum">Limpar</button></div>';
    const temPerfil = itens.some(i=>i.pf);
    h += '<table class="marcas"><thead><tr><th style="width:26px"></th><th>Marca</th>'
      + (temPerfil?'<th>Perfil</th>':'')
      + '<th class="num">Qte</th><th class="num" title="peças com apontamento no Syneco">Feito</th>'
      + '<th class="num">kg</th><th>GRD</th></tr></thead><tbody>';
    for(const i of corte){
      const s = sel.has(i.m);
      h += '<tr class="'+(s?"sel":"")+'"><td><input type="checkbox" class="ck" data-m="'+i.m+'"'+(s?" checked":"")+'></td>'
        + '<td><b>'+i.m+'</b></td>'+(temPerfil?'<td style="color:#5b6a7d">'+(i.pf||"—")+'</td>':'')
        + '<td class="num">'+i.q+'</td>'
        /* ⚠ o `f` é o apontamento do Syneco por marca — o MESMO número que preenche a barra do
           Gantt. Se a coluna e a barra discordassem, uma das duas estaria mentindo. */
        + '<td class="num">'+(i.f
            ? (i.f>=i.q ? '<b style="color:#136c35">'+i.f+'</b>' : i.f)
            : '<span style="color:#aab4c0">—</span>')+'</td>'
        + '<td class="num">'+dep.nkg(i.kg)+'</td>'
        + '<td>'+(i.g
            ? '<span class="pilha ok" title="impressa por '+(i.g.por||"—")+(i.g.n>1?" · "+i.g.n+" cópias":"")+'">✓ '+dep.dbr(i.g.em)+(i.g.n>1?" ·"+i.g.n+"×":"")+'</span>'
            : '<span class="pilha nao">não impressa</span>')+'</td></tr>';
    }
    h += '</tbody>';
    /* soma a lista MOSTRADA (o filtro "só os não impressos" muda o conjunto), não apenas as 300 que
       cabem na tela — senão o total mentiria justo na OP grande, que é quando ele importa. */
    const somaQ = mostra.reduce((a,i)=>a+i.q,0);
    const somaF = mostra.reduce((a,i)=>a+(i.f||0),0);
    const somaKg = mostra.reduce((a,i)=>a+i.kg,0);
    h += '<tfoot><tr><td></td>'
      + '<td><b>Total</b> <span style="color:#5b6a7d">· '+mostra.length+' marca'+(mostra.length===1?'':'s')
      + (soFalta?', só as não impressas':'')+'</span></td>'
      + (temPerfil?'<td></td>':'')
      + '<td class="num"><b>'+somaQ.toLocaleString("pt-BR")+'</b></td>'
      + '<td class="num"><b'+(somaF?' style="color:#136c35"':'')+'>'+somaF.toLocaleString("pt-BR")+'</b>'
      + ' <span style="color:#5b6a7d">('+Math.round(somaQ?somaF/somaQ*100:0)+'%)</span></td>'
      + '<td class="num"><b>'+dep.nkg(somaKg)+'</b></td><td></td></tr></tfoot></table>';
    if(mostra.length > teto) h += '<div class="dica">Mostrando '+teto+' de '+mostra.length+' marcas. Os botões abaixo agem sobre a lista inteira.</div>';
    h += '<div class="dica"><b>GRD = impressão.</b> No portal não existe estado "liberado" separado: a GRD nasce quando o '
      + 'desenho é impresso, e reimprimir a mesma marca soma uma cópia no registro em vez de criar outra GRD. '
      + 'O ponto amarelo na barra do Gantt marca a programação que ainda tem projeto sem imprimir.</div>';
    dep.$("pCorpo").innerHTML = h;

    const alvo = soFalta ? mostra : itens;
    dep.$("pFoot").innerHTML =
        '<div class="info">'+(sel.size ? sel.size+" marca(s) selecionada(s)" : "Nada selecionado — os botões usam a lista acima")+'</div>'
      + '<button class="btn pri" id="gp-impFalta"'+(semG?"":" disabled")+'>Imprimir as '+semG+' sem GRD</button>'
      + '<button class="btn" id="gp-impSel"'+(sel.size?"":" disabled")+'>Reimprimir selecionados</button>';

    dep.$("fSemGrd").onchange = (e)=>{ soFalta = e.target.checked; dep.pintarPainel(); };
    dep.$("selTodos").onclick = ()=>{ for(const i of alvo) sel.add(i.m); dep.pintarPainel(); };
    dep.$("selNenhum").onclick = ()=>{ sel.clear(); dep.pintarPainel(); };
    for(const c of dep.raiz.querySelectorAll("#gp-pCorpo .ck"))
      c.onchange = ()=>{ if(c.checked) sel.add(c.dataset.m); else sel.delete(c.dataset.m); dep.pintarPainel(); };
    const im = dep.$("impFalta");
    if(im) im.onclick = ()=>imprimir(r, itens.filter(i=>!i.g).map(i=>i.m), "primeira impressão");
    const is = dep.$("impSel");
    if(is) is.onclick = ()=>imprimir(r, [...sel], "reimpressão");
  }

  const SETOR_GRD = { CORTE:"CORTE", MONTAGEM:"MONTAGEM", SOLDA:"SOLDA" };
  async function imprimir(r, marcas, tipo){
    if(!marcas.length) return;
    if(marcas.length > dep.MAX_LOTE){
      dep.avisar(false, "A rota aceita no máximo "+dep.MAX_LOTE+" marcas por vez (são "+marcas.length+"). Use a seleção para dividir em blocos.");
      return;
    }
    if(!confirm("Imprimir "+marcas.length+" desenho(s) da OP-"+r.op+" ("+tipo+")?\n\nCada um sai carimbado com a rastreabilidade e a GRD fica registrada. Pode levar alguns minutos.")) return;
    const foot = dep.$("pFoot"); foot.querySelectorAll("button").forEach(b=>b.disabled=true);
    try{
      const bancadaPorMarca = {};
      if(r.setor!=="CORTE" && r.recurso) for(const m of marcas) bancadaPorMarca[m] = r.recurso;
      const res = await fetch("/api/producao/desenhos/lote", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ opNumero:r.op, marcas, setor: SETOR_GRD[r.setor], acao:"IMPRIMIR",
                               ...(Object.keys(bancadaPorMarca).length ? { bancadaPorMarca } : {}) }),
      });
      const j = await res.json();
      if(!res.ok) throw new Error(j.error || "Erro ao emitir o lote");
      const emitidas = Number(j.emitidas) || 0;
      const sem = j.semDesenho?.length || 0;
      const faltantes = sem ? " Sem desenho na pasta da OP: "+j.semDesenho.slice(0,8).join(", ")+(sem>8?" e mais "+(sem-8):"")+"." : "";
      if(!emitidas){
        dep.avisar(false, "Nenhum desenho foi encontrado para as "+marcas.length+" marca(s), então nada foi impresso nem liberado."+faltantes
          + " Confira se os PDFs estão em 2. Engenharia › 2.5 Projetos › 2.5.2 Fabricação, com o nome começando pela marca.");
        return;
      }
      let erroZip = null;
      try{ await dep.baixarZip(j, r.op, r.setor.toLowerCase()); }catch(e){ erroZip = e?.message || "falhou"; }
      dep.avisar(!erroZip, emitidas+" desenho(s) liberado(s)"
        + (erroZip ? ", mas o download falhou ("+erroZip+"). A GRD está registrada; abra os arquivos pela pasta da OP."
                   : " e baixado(s) em pastas por impressora.") + faltantes);
      await dep.recarregar();
    }catch(e){ dep.avisar(false, e.message); }
    finally{ foot.querySelectorAll("button").forEach(b=>b.disabled=false); }
  }

  /* ── quebra da programação ──────────────────────────────────────────────────── */

  return { reiniciar, pintarProjetos };
}
