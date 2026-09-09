import { abrirFiltroColuna } from "./filtro-coluna";
import { filtrarProjetos, escapar } from "./selecao-projetos";
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
  let sel = new Set(), soFalta = false, colunas = {};

  function reiniciar(){ sel = new Set(); soFalta = false; colunas = {}; }

  function pintarProjetos(r){
    const itens = [...r.itens].sort((a,b)=> (a.g?1:0)-(b.g?1:0) || String(a.m).localeCompare(String(b.m)));
    const mostra = filtrarProjetos(itens, { colunas, soFalta: soFalta && temGrd(r.setor) });
    const teto = 300, corte = mostra.slice(0, teto);
    const grd = temGrd(r.setor);
    const semG = grd ? mostra.filter(i=>!i.g).length : 0;
    const ativos = Object.values(colunas).filter(v=>v!=null).length;
    let h = '<div class="ptool filtro-resumo"><span>'+mostra.length+' de '+itens.length+' marcas'
      + (ativos?' · '+ativos+' filtro(s) ativo(s)':' · Filtre pelas setas das colunas')+'</span>'
      + (ativos||soFalta?'<button class="btn mini" id="gp-fLimpar">Limpar filtros</button>':'')+'</div><div class="ptool">'
      + (grd
          ? '<b style="color:#8a5600">'+semG+' marca(s) sem GRD</b> · <b style="color:#136c35">'+(mostra.length-semG)+' já impressa(s)</b>'
            + '<label><input type="checkbox" id="gp-fSemGrd"'+(soFalta?" checked":"")+'> só os não impressos</label>'
          : '')
      + '<button class="btn mini" id="gp-selTodos">Selecionar os filtrados</button>'
      + '<button class="btn mini" id="gp-selNenhum">Limpar</button></div>';
    const temPerfil = itens.some(i=>i.pf);
    const cabecalho = (campo, rotulo) => '<th><button class="filtro-coluna'+(colunas[campo]!=null?' ativo':'')+'" data-filtro="'+campo+'" aria-haspopup="dialog" title="Filtrar '+rotulo+'" aria-label="Filtrar '+rotulo+'">'+rotulo+' <span aria-hidden="true">'+(colunas[campo]!=null?'●':'▾')+'</span></button></th>';
    h += '<table class="marcas"><thead><tr><th style="width:26px"></th>'+cabecalho('m','Marca')
      + (temPerfil?cabecalho('pf','Perfil'):'')+cabecalho('mt','Material / aço')
      + '<th class="num">Qte</th><th class="num" title="peças com apontamento no Syneco">Feito</th>'
      + '<th class="num">kg</th>'+(grd?'<th>GRD</th>':'')+'</tr></thead><tbody>';
    for(const i of corte){
      const s = sel.has(i.id);
      h += '<tr class="'+(s?"sel":"")+'"><td><input type="checkbox" class="ck" data-m="'+escapar(i.id)+'"'+(s?" checked":"")+'></td>'
        + '<td><b>'+escapar(i.m)+'</b></td>'+(temPerfil?'<td style="color:#5b6a7d">'+escapar(i.pf||"—")+'</td>':'')
        + '<td>'+escapar(i.mt||'—')+'</td>'
        + '<td class="num">'+i.q+'</td>'
        /* ⚠ o `f` é o apontamento do Syneco por marca — o MESMO número que preenche a barra do
           Gantt. Se a coluna e a barra discordassem, uma das duas estaria mentindo. */
        + '<td class="num">'+(i.f
            ? (i.f>=i.q ? '<b style="color:#136c35">'+i.f+'</b>' : i.f)
            : '<span style="color:#aab4c0">—</span>')+'</td>'
        + '<td class="num">'+dep.nkg(i.kg)+'</td>'
        + (grd
            ? '<td>'+(i.g
                ? '<span class="pilha ok" title="impressa por '+(i.g.por||"—")+(i.g.n>1?" · "+i.g.n+" cópias":"")+'">✓ '+dep.dbr(i.g.em)+(i.g.n>1?" ·"+i.g.n+"×":"")+'</span>'
                : '<span class="pilha nao">não impressa</span>')+'</td>'
            : '')+'</tr>';
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
      + (temPerfil?'<td></td>':'')+'<td></td>'
      + '<td class="num"><b>'+somaQ.toLocaleString("pt-BR")+'</b></td>'
      + '<td class="num"><b'+(somaF?' style="color:#136c35"':'')+'>'+somaF.toLocaleString("pt-BR")+'</b>'
      + ' <span style="color:#5b6a7d">('+Math.round(somaQ?somaF/somaQ*100:0)+'%)</span></td>'
      + '<td class="num"><b>'+dep.nkg(somaKg)+'</b></td>'+(grd?'<td></td>':'')+'</tr></tfoot></table>';
    if(mostra.length > teto) h += '<div class="dica">Mostrando '+teto+' de '+mostra.length+' marcas. Os botões abaixo agem sobre a lista inteira.</div>';
    if(grd) h += '<div class="dica"><b>GRD = impressão.</b> No portal não existe estado "liberado" separado: a GRD nasce quando o '
      + 'desenho é impresso, e reimprimir a mesma marca soma uma cópia no registro em vez de criar outra GRD. '
      + 'O ponto amarelo na barra do Gantt marca a programação que ainda tem projeto sem imprimir.</div>';
    dep.$("pCorpo").innerHTML = h;

    const alvo = mostra;
    /* ⚠ sem GRD o rodapé não tem o que oferecer: os dois botões imprimem maço de desenho, e da
       solda em diante não há maço. Some inteiro em vez de ficar desabilitado — botão morto na tela
       é convite para alguém perguntar por que não funciona. */
    /* ⚠⚠ O CADERNO DE PINTURA SAI DA BARRA. Vitor (07/09/2026): "todas as folhas sairão da OP
       selecionada na barra do Gantt de cada OP" — três folhas (quantidade · qual tinta usar · para
       o pintor), sempre da OP do lote clicado, nunca de um consolidado. */
    const btnPint = r.setor === "PINTURA"
      ? '<button class="btn" id="gp-xlsPint">Caderno de pintura (Excel)</button>' : "";
    /* ⚠⚠ BAIXA SYNECO — ideia do Vitor (08/09/2026): "criar um botão ao lado do reimprimir, Baixa
       Syneco: será exportada uma planilha para poder dar baixa no Syneco das marcas selecionadas".
       O portal não baixa nada: quem lança é a pessoa, no Syneco, e o número volta pelo sync. Assim
       o quadro, o cronograma e o portal do cliente continuam falando o mesmo número. */
    /* ⚠ USA A SELEÇÃO, OU A LISTA INTEIRA — como o botão de imprimir ao lado. Eu tinha deixado o
       botão DESABILITADO sem seleção e o Vitor não conseguiu baixar: o próprio rodapé promete "os
       botões usam a lista acima", e um botão morto ali só levanta a pergunta de por que não
       funciona. Gerar planilha não escreve nada, então agir sobre a lista toda é seguro. */
    const alvoBaixa = sel.size ? itens.filter(i=>sel.has(i.id)) : mostra;
    const btnBaixa = '<button class="btn" id="gp-xlsBaixa"'+(alvoBaixa.length?"":" disabled")+'>Baixa Syneco ('+alvoBaixa.length+')</button>';
    dep.$("pFoot").innerHTML = grd
      ? '<div class="info">'+(sel.size ? sel.size+" marca(s) selecionada(s)" : "Nada selecionado — os botões usam a lista acima")+'</div>'
        + '<button class="btn pri" id="gp-impFalta"'+(semG?"":" disabled")+'>Imprimir as '+semG+' sem GRD</button>'
        + '<button class="btn" id="gp-impSel"'+(sel.size?"":" disabled")+'>Reimprimir selecionados</button>' + btnBaixa + btnPint
      : '<div class="info">'+(sel.size ? sel.size+" marca(s) selecionada(s)" : "Sem GRD neste setor — o desenho desce até a montagem")+'</div>' + btnPint;

    dep.$("pFoot").innerHTML += '<button class="btn pri" id="gp-distribuir"'+(sel.size?'':' disabled')+'>Distribuir selecionados ('+sel.size+')</button>';
    /* ⚠ APAGAR usa a SELEÇÃO, ou a lista inteira — como imprimir e Baixa Syneco. Botão morto sem
       seleção só levanta a pergunta de por que não funciona (foi o que aconteceu com a Baixa). */
    const alvoApagar = sel.size ? itens.filter(i=>sel.has(i.id)) : mostra;
    dep.$("pFoot").innerHTML += '<button class="btn perigo" id="gp-apagar"'+(alvoApagar.length?'':' disabled')+'>Apagar a programação ('+alvoApagar.length+')</button>';
    /* ⚠ o filtro só existe quando há GRD; sem a guarda, `$("fSemGrd")` volta null e o painel
       inteiro morre no `.onchange`. */
    const fg = dep.$("fSemGrd");
    if(fg) fg.onchange = (e)=>{ soFalta = e.target.checked; sel.clear(); dep.pintarPainel(); };
    for(const botao of dep.raiz.querySelectorAll('[data-filtro]')) botao.onclick=()=>{
      const campo=botao.dataset.filtro;
      const outros={...colunas}; delete outros[campo];
      const disponiveis=filtrarProjetos(itens,{colunas:outros,soFalta:soFalta&&grd});
      abrirFiltroColuna({raiz:dep.raiz,botao,campo,itens:disponiveis,valores:colunas[campo],aplicar:valores=>{
        colunas[campo]=valores; sel.clear(); dep.pintarPainel();
        dep.raiz.querySelector('[data-filtro="'+campo+'"]')?.focus();
      }});
    };
    const limpar=dep.$("fLimpar");
    if(limpar) limpar.onclick=()=>{ colunas={}; soFalta=false; sel.clear(); dep.pintarPainel(); };
    dep.$("distribuir").onclick=()=>dep.abrirQuebra();
    dep.$("apagar").onclick=()=>confirmarApagar(r, alvoApagar);
    dep.$("selTodos").onclick = ()=>{ for(const i of alvo) sel.add(i.id); dep.pintarPainel(); };
    dep.$("selNenhum").onclick = ()=>{ sel.clear(); dep.pintarPainel(); };
    for(const c of dep.raiz.querySelectorAll("#gp-pCorpo .ck"))
      c.onchange = ()=>{ if(c.checked) sel.add(c.dataset.m); else sel.delete(c.dataset.m); dep.pintarPainel(); };
    const bp = dep.$("xlsPint");
    if(bp) bp.onclick = async ()=>{
      bp.disabled = true; const antes = bp.textContent; bp.textContent = "Gerando…";
      /* ⚠ manda os IDS do lote, não a OP inteira: a barra representa o que vai ser pintado agora, e
         a folha tem de dimensionar a tinta desse lote — não da obra toda. */
      try{ await dep.baixarPintura(r.op, alvoBaixa.map(i=>i.id).filter(Boolean)); }
      catch(e){ dep.avisar(e?.message || "Falha ao gerar o caderno de pintura", "erro"); }
      finally{ bp.disabled = false; bp.textContent = antes; }
    };
    const bb = dep.$("xlsBaixa");
    if(bb) bb.onclick = async ()=>{
      bb.disabled = true; const antes = bb.textContent; bb.textContent = "Gerando…";
      // ⚠ manda as MARCAS selecionadas, resolvidas para os ids das peças do lote clicado
      try{ await dep.baixarBaixaSyneco(r.op, r.setor, alvoBaixa.map(i=>i.id).filter(Boolean)); }
      catch(e){ dep.avisar(e?.message || "Falha ao gerar a planilha de baixa", "erro"); }
      finally{ bb.disabled = false; bb.textContent = antes; }
    };
    const im = dep.$("impFalta");
    if(im) im.onclick = ()=>imprimir(r, mostra.filter(i=>!i.g).map(i=>i.m), "primeira impressão");
    const is = dep.$("impSel");
    if(is) is.onclick = ()=>imprimir(r, itens.filter(i=>sel.has(i.id)).map(i=>i.m), "reimpressão");
  }

  /* ⚠⚠ GRD SÓ ATÉ A MONTAGEM. Vitor (07/09/2026): "da solda para frente não temos mais GRDs,
     precisa tirar essa marcação no resumo das peças". O desenho desce para cortar e para montar;
     da solda em diante a peça já está na mão de quem executa e não há maço para imprimir.
     Este mapa manda em tudo: quem não está aqui não mostra coluna GRD, nem contador de "sem GRD",
     nem botão de imprimir. */
  const SETOR_GRD = { CORTE:"CORTE", MONTAGEM:"MONTAGEM" };
  const temGrd = (setor)=> !!SETOR_GRD[setor];
  /* ── A TRAVA DO MATERIAL, ANTES DE IMPRIMIR ─────────────────────────────────
     ⚠ Vitor (05/09/2026): "não podemos permitir liberar desenhos sem a definição do R da peça, pois
     a rastreabilidade é o nosso maior ponto forte" — e, sobre o atrito: "um aviso deve aparecer na
     tela e informar na hora o R para não perder tempo e já tirar isso da frente".

     A trava já existia em lib/desenhos-lote.js desde 26/08 e fazia a metade certa: prendia a peça
     sem material. A metade que faltava era a porta — as presas sumiam do lote e voltavam como uma
     lista de nomes, e quem estava emitindo ia caçar o R noutra tela.

     ⚠ O R É POR PERFIL. `TrocaRastreabilidade` é única em (opNumero, perfil), então confirmar um R
     solta TODAS as marcas daquele perfil de uma vez. A tela agrupa assim de propósito: uma linha
     por perfil, não por marca — senão a pessoa confirmaria o mesmo aço dez vezes.

     ⚠ SEM_MATERIAL NÃO SE RESOLVE AQUI, e isso é o ponto. Confirmar um R é dizer QUAL aço foi
     usado; não é atalho para liberar o que não tem aço nenhum. */
  async function conferirMaterial(r, marcas){
    const res = await fetch("/api/producao/desenhos/lote", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ opNumero:r.op, marcas, setor: SETOR_GRD[r.setor], acao:"CONFERIR" }),
    });
    const j = await res.json();
    if(!res.ok) throw new Error(j.error || "Erro ao conferir o material");
    return j;
  }

  /** uma linha por PERFIL, com as marcas que ele prende */
  function agruparPorPerfil(semMaterial){
    const m = new Map();
    for(const x of semMaterial || []){
      const k = String(x.perfil || "—");
      const a = m.get(k) || { perfil:k, marcas:[], resolvivel:!!x.resolvivel, rSugerido:x.rSugerido || "",
                              ops:x.opsDoMaterial || [], desc:x.descricaoCmr || "", motivo:x.motivo,
                              faltaRotulo:x.faltaRotulo };
      a.marcas.push(x.marca);
      m.set(k, a);
    }
    return [...m.values()].sort((a,b)=> (b.resolvivel?1:0)-(a.resolvivel?1:0) || a.perfil.localeCompare(b.perfil));
  }

  function abrirTravaMaterial(r, tipo, conf){
    const grupos = agruparPorPerfil(conf.semMaterial);
    const podem = new Set(conf.prontas || []);
    const dlg = document.createElement("dialog");
    const resolviveis = grupos.filter(g=>g.resolvivel);
    const travadas = grupos.filter(g=>!g.resolvivel);

    const pintar = ()=>{
      const nPresas = grupos.filter(g=>g.resolvivel).reduce((s,g)=>s+g.marcas.length,0);
      dlg.innerHTML =
        '<h3>Material — '+(nPresas ? nPresas+' marca(s) esperando o R' : 'tudo conferido')+'</h3>'
        + '<div class="corpo">'
        + (resolviveis.length
            ? '<p>Estas peças usam <b>material de estoque</b>, comprado sob outra OP. O portal sugere o R do CMR — '
              + 'confirme e elas entram no lote. <b>O R vale para o perfil inteiro</b>, então uma confirmação solta todas as marcas dele.</p>'
              + '<table class="trava"><thead><tr><th>Perfil</th><th>Marcas</th><th>R usado</th><th></th></tr></thead><tbody>'
              + resolviveis.map((g,i)=>
                  '<tr class="'+(g.feito?"ok":"")+'"><td><b>'+g.perfil+'</b>'
                  + (g.desc?'<div class="org">'+g.desc+'</div>':'')+'</td>'
                  + '<td>'+g.marcas.length+' <span class="org">'+g.marcas.slice(0,3).join(", ")
                  + (g.marcas.length>3?" …":"")+'</span></td>'
                  + '<td><input class="rin" data-i="'+i+'" value="'+(g.rUsado||g.rSugerido||"")+'" '
                  + (g.feito?'disabled ':'')+'>'
                  + (g.ops.length?'<div class="org">sugerido do CMR · OP-'+g.ops[0]+'</div>':'')+'</td>'
                  + '<td>'+(g.feito
                      ? '<span class="pilha ok">✓ confirmado</span>'
                      : '<button class="btn mini" data-conf="'+i+'">Confirmar</button>')+'</td></tr>').join("")
              + '</tbody></table>'
            : '')
        + (travadas.length
            ? '<p style="margin-top:14px"><b>Sem material — ficam de fora.</b> Não dá para liberar daqui; '
              + 'confirmar um R diz qual aço foi usado, não cria aço que não chegou.</p>'
              + '<table class="trava"><tbody>'
              + travadas.map(g=>'<tr class="travada"><td><b>'+g.perfil+'</b></td><td>'+g.marcas.length+' marca(s) '
                  + '<span class="org">'+g.marcas.slice(0,3).join(", ")+(g.marcas.length>3?" …":"")+'</span></td>'
                  + '<td colspan="2"><span class="mot">'+(g.faltaRotulo||g.motivo||"sem entrada no CMR")+'</span></td></tr>').join("")
              + '</tbody></table>'
            : '')
        + '</div>'
        + '<div class="pe"><button class="btn" data-x="1">Cancelar</button>'
        + '<button class="btn pri" data-ir="1"'+(podem.size?'':' disabled')+'>Imprimir '+podem.size+' liberada(s)</button></div>';

      dlg.querySelector('[data-x]').onclick = ()=>dlg.close();
      dlg.querySelector('[data-ir]').onclick = ()=>{ dlg.close(); emitirLote(r, [...podem], tipo); };
      for(const b of dlg.querySelectorAll("[data-conf]")) b.onclick = async ()=>{
        const g = resolviveis[+b.dataset.conf];
        const inp = dlg.querySelector('.rin[data-i="'+b.dataset.conf+'"]');
        const rUsado = String(inp?.value || "").trim();
        if(!rUsado){ dep.avisar(false, "Informe o R usado neste perfil."); return; }
        b.disabled = true; b.textContent = "…";
        try{
          const res = await fetch("/api/pcp/liberacao-material", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ opNumero:r.op, perfil:g.perfil, rUsado }),
          });
          const j = await res.json();
          if(!res.ok) throw new Error(j.error || "Não foi possível gravar o R");
          g.feito = true; g.rUsado = rUsado;
          for(const m of g.marcas) podem.add(m);   // o perfil inteiro entra no lote
          pintar();
        }catch(e){ dep.avisar(false, e.message); b.disabled = false; b.textContent = "Confirmar"; }
      };
    };

    pintar();
    dep.raiz.appendChild(dlg);
    dlg.addEventListener("close", ()=>dlg.remove());
    dlg.showModal();
  }

  async function imprimir(r, marcas, tipo){
    if(!marcas.length) return;
    // conferência primeiro: se algo estiver preso, a pessoa resolve na hora em vez de descobrir depois
    try{
      const conf = await conferirMaterial(r, marcas);
      if(conf?.semMaterial?.length){ abrirTravaMaterial(r, tipo, conf); return; }
    }catch(e){ dep.avisar(false, e.message); return; }
    await emitirLote(r, marcas, tipo);
  }

  /* ⚠⚠ O LOTE SE FATIA SOZINHO — o teto é da máquina, não da pessoa. Vitor (08/09/2026), na barra do
     Gantt: "ao clicar em imprimir e liberar ele dá o erro das 80 peças, estamos selecionando 260 e
     ele fala que o limite é 80" e, antes, "se formos fazer isso um por um estamos mortos".

     O teto existe de verdade: baixar, carimbar e juntar dezenas de A1 estoura os 300 s da rota.
     Mas recusar transfere para quem programa um problema que é do servidor — e selecionar 80 de 260
     na mão, quatro vezes, sem errar quais já foram, é trabalho que ninguém deveria fazer.

     ⚠ UM DOWNLOAD POR BLOCO, de propósito: o ZIP já vem separado por bandeja, e juntar tudo num só
     faria esperar os quatro blocos para começar a imprimir o primeiro.
     ⚠ Se um bloco falhar, PARA e diz qual — seguir em frente deixaria metade das GRDs registradas
     sem ninguém saber onde parou. */
  async function emitirLote(r, marcas, tipo){
    if(!marcas.length) return;
    const TETO = dep.MAX_LOTE || 80;
    const blocos = [];
    for(let i=0; i<marcas.length; i+=TETO) blocos.push(marcas.slice(i, i+TETO));
    const emBlocos = blocos.length > 1 ? " em "+blocos.length+" blocos de até "+TETO : "";
    if(!confirm("Imprimir "+marcas.length+" desenho(s) da OP-"+r.op+" ("+tipo+")"+emBlocos+"?\n\nCada um sai carimbado com a rastreabilidade e a GRD fica registrada."
      + (blocos.length>1 ? " Sai um download por bloco." : "") + " Pode levar alguns minutos.")) return;
    const foot = dep.$("pFoot"); foot.querySelectorAll("button").forEach(b=>b.disabled=true);
    let emitidas = 0; const semDesenho = []; let erroZip = null;
    try{
      for(let b=0; b<blocos.length; b++){
        if(blocos.length>1) dep.avisar(true, "Bloco "+(b+1)+" de "+blocos.length+" — gerando os desenhos…");
        const bancadaPorMarca = {};
        if(r.setor!=="CORTE" && r.recurso) for(const m of blocos[b]) bancadaPorMarca[m] = r.recurso;
        const res = await fetch("/api/producao/desenhos/lote", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ opNumero:r.op, marcas: blocos[b], setor: SETOR_GRD[r.setor], acao:"IMPRIMIR",
                                 ...(Object.keys(bancadaPorMarca).length ? { bancadaPorMarca } : {}) }),
        });
        const j = await res.json();
        if(!res.ok) throw new Error((blocos.length>1 ? "Bloco "+(b+1)+" de "+blocos.length+": " : "")+(j.error || "Erro ao emitir o lote"));
        emitidas += Number(j.emitidas) || 0;
        semDesenho.push(...(j.semDesenho || []));
        if(Number(j.emitidas) > 0){
          try{ await dep.baixarZip(j, r.op + (blocos.length>1 ? "-bloco"+(b+1)+"de"+blocos.length : ""), r.setor.toLowerCase()); }
          catch(e){ erroZip = e?.message || "falhou"; }
        }
      }
      const sem = semDesenho.length;
      const faltantes = sem ? " Sem desenho na pasta da OP: "+semDesenho.slice(0,8).join(", ")+(sem>8?" e mais "+(sem-8):"")+"." : "";
      if(!emitidas){
        dep.avisar(false, "Nenhum desenho foi encontrado para as "+marcas.length+" marca(s), então nada foi impresso nem liberado."+faltantes
          + " Confira se os PDFs estão em 2. Engenharia › 2.5 Projetos › 2.5.2 Fabricação, com o nome começando pela marca.");
        return;
      }
      dep.avisar(!erroZip, emitidas+" desenho(s) liberado(s)"+(blocos.length>1 ? " em "+blocos.length+" blocos" : "")
        + (erroZip ? ", mas um download falhou ("+erroZip+"). A GRD está registrada; abra os arquivos pela pasta da OP."
                   : " e baixado(s) em pastas por impressora.") + faltantes);
      await dep.recarregar();
    }catch(e){ dep.avisar(false, e.message); }
    finally{ foot.querySelectorAll("button").forEach(b=>b.disabled=false); }
  }

  /* ── quebra da programação ──────────────────────────────────────────────────── */

  function idsParaDividir() { return new Set(sel); }

  /* ─── APAGAR A PROGRAMAÇÃO ────────────────────────────────────────────────────────────────────
     Vitor (08/09/2026): "precisa ter um botão para podermos deletar uma programação, e com isso
     sair da fila; o planejamento terá que reprogramar novas peças, pois pode ter sido revisão,
     lançamento duplo e etc".

     ⚠ TRÊS GRUPOS, TRATADOS DIFERENTE — decisão dele no mesmo dia:
       • sem apontamento → apaga direto;
       • COM apontamento → vem desmarcada, uma a uma. Programação de trabalho que já aconteceu não
         some sem alguém olhar;
       • com GRD impressa → apaga, mas avisa que o papel pode estar no chão de fábrica. A GRD em si
         NÃO se apaga: é registro de auditoria do que foi impresso [[torg_grd_desenhos]].

     ⚠ E NÃO MEXE NO SYNECO. Se a ordem já foi lançada no MES, ela continua aberta lá — o aviso está
     no diálogo porque quem apaga aqui precisa saber que falta o outro lado. */
  function confirmarApagar(r, alvo){
    const comApont = alvo.filter(i=>i.f>0);
    const semApont = alvo.filter(i=>!(i.f>0));
    const comGrd = alvo.filter(i=>i.g);
    const marcados = new Set();                       // as com apontamento entram desmarcadas
    const dlg = document.createElement("dialog");

    const pintar = ()=>{
      const total = semApont.length + marcados.size;
      dlg.innerHTML =
        '<h3>Apagar a programação — '+r.setor.toLowerCase()+' · '+(r.recurso||"sem recurso")+' · '+dep.dbr(r.dia)+'</h3>'
        + '<div class="corpo">'
        + '<p>As peças saem do quadro <b>e da fila</b> — não voltam para a faixa "sem bancada". Quem decide se elas '
          + 'voltam é o Planejamento, liberando de novo.</p>'
        + (semApont.length
            ? '<p><b>'+semApont.length+' marca(s) sem apontamento</b> — serão apagadas.</p>' : '')
        + (comApont.length
            ? '<p style="margin-top:12px"><b>'+comApont.length+' marca(s) já têm apontamento no Syneco.</b> '
              + 'Marque as que devem sair mesmo assim:</p>'
              + '<table class="trava"><tbody>'
              + comApont.map((i,n)=>'<tr class="'+(marcados.has(i.id)?"":"travada")+'">'
                  + '<td style="width:26px"><input type="checkbox" data-ap="'+n+'"'+(marcados.has(i.id)?" checked":"")+'></td>'
                  + '<td><b>'+escapar(i.m)+'</b></td>'
                  + '<td><span class="org">'+i.f+' de '+i.q+' já feitas</span></td></tr>').join("")
              + '</tbody></table>' : '')
        + (comGrd.length
            ? '<p style="margin-top:12px"><b>⚠ '+comGrd.length+' marca(s) já tiveram o desenho impresso</b> — '
              + 'recolha o papel do chão de fábrica. A GRD continua no histórico, como registro do que foi emitido.</p>' : '')
        + '<p style="margin-top:12px"><b>A ordem no Syneco continua aberta.</b> Se for revisão ou lançamento duplo, '
          + 'alguém precisa cancelar lá também — o portal não mexe no MES.</p>'
        + '<p style="margin-top:12px">Motivo:<br><select id="gp-motivo" style="margin-top:4px;padding:6px;width:100%">'
          + ['revisão do projeto','lançamento duplo','programado na máquina errada','outro']
              .map(m=>'<option>'+m+'</option>').join("")
          + '</select></p>'
        + '</div>'
        + '<div class="pe"><button class="btn" data-x="1">Cancelar</button>'
        + '<button class="btn perigo" data-ok="1"'+(total?'':' disabled')+'>Apagar '+total+' marca(s)</button></div>';

      dlg.querySelector('[data-x]').onclick = ()=>dlg.close();
      for(const c of dlg.querySelectorAll("[data-ap]")) c.onchange = ()=>{
        const i = comApont[+c.dataset.ap];
        if(c.checked) marcados.add(i.id); else marcados.delete(i.id);
        pintar();
      };
      dlg.querySelector('[data-ok]').onclick = async (ev)=>{
        const b = ev.currentTarget;
        const escolhidas = [...semApont, ...comApont.filter(i=>marcados.has(i.id))];
        const motivo = dlg.querySelector("#gp-motivo")?.value || "outro";
        b.disabled = true; b.textContent = "Apagando…";
        try{
          const res = await fetch("/api/pcp/gantt/apagar", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ motivo, blocos:[{ setor:r.setor, recurso:r.recurso||null, dia:r.dia||null,
              ids: escolhidas.map(i=>i.id), marcas: escolhidas.map(i=>i.m) }] }),
          });
          const j = await res.json();
          if(!res.ok) throw new Error(j.error || "Não foi possível apagar");
          dlg.close();
          dep.avisar(true, j.total+" peça(s) fora da programação e da fila."
            + (comGrd.length ? " Recolha o desenho de "+comGrd.length+" marca(s) no chão de fábrica." : ""));
          dep.recarregar();
        }catch(e){ dep.avisar(false, e.message); b.disabled = false; b.textContent = "Apagar"; }
      };
    };

    pintar();
    dep.raiz.appendChild(dlg);
    dlg.addEventListener("close", ()=>dlg.remove());
    dlg.showModal();
  }

  return { reiniciar, pintarProjetos, idsParaDividir };
}
