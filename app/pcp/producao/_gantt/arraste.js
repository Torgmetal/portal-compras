// ─── ARRASTAR A BARRA PARA REMANEJAR ───────────────────────────────────────────────────────────
//
// ⚠ SOLTAR NO FIM DE SEMANA ESCORREGA PARA A SEGUNDA. Mover o bloco é a operação de todo dia e não
// pode plantar trabalho no sábado por descuido. Quem JÁ estava num fim de semana continua lá — só
// se veio assim do banco, programado por fora desta tela; mover não desfaz decisão de ninguém.
//
// ⚠ O ESTADO DO GESTO É LOCAL E PASSA POR PARÂMETRO. A versão que fechava sobre uma variável de
// módulo estourou "Cannot set properties of null" assim que existiu um segundo gesto na tela.
//
// ⚠ `inicio` e `painel` entram por GETTER, não por valor: os dois mudam entre o início e o fim do
// arraste (a grade rola sozinha na borda), e um valor capturado na montagem estaria velho na hora
// de soltar.

export function criarArraste(dep){
  /* ── arraste ────────────────────────────────────────────────────────────────── */
  let arr = null;
  const BORDA = 46, PASSO = 16;
  // Recebe o estado por parâmetro em vez de fechar sobre `arr`. A versão que fechava
  // sobre `arr` estourou "Cannot set properties of null" assim que existiu um segundo
  // gesto de arraste na tela; hoje só existe um de novo, mas depender de uma variável
  // global é a armadilha que já pegou uma vez.
  function autoRolar(e, st){
    if(!st) return;
    const rol = dep.raiz.querySelector(".rolagem"), r = rol.getBoundingClientRect();
    let vy=0, vx=0;
    if(e.clientY < r.top+BORDA) vy=-PASSO; else if(e.clientY > r.bottom-BORDA) vy=PASSO;
    if(e.clientX < r.left+BORDA) vx=-PASSO; else if(e.clientX > r.right-BORDA) vx=PASSO;
    if(!vy && !vx){ st.rolando=null; return; }
    st.rolando = {vx,vy};
    if(st.raf) return;
    const passo = ()=>{ if(!st.rolando){ st.raf=null; return; }
      rol.scrollTop += st.rolando.vy; rol.scrollLeft += st.rolando.vx; st.raf = requestAnimationFrame(passo); };
    st.raf = requestAnimationFrame(passo);
  }
  function limparAlvos(){ for(const c of dep.grade.querySelectorAll(".cel.alvo,.cel.proibido")) c.classList.remove("alvo","proibido"); }
  function pegar(e){
    if(e.button!==0) return;
    const el = e.currentTarget;
    const r = dep.montarRuns().find(x=>x.id===el.dataset.run); if(!r) return;
    if(r.terceiroPrevisto){window.location.href="/pcp/terceirizados";return;}
    const cx = el.getBoundingClientRect();
    arr = { el, r, x0:e.clientX, y0:e.clientY, dx:e.clientX-cx.left, dy:e.clientY-cx.top, alvo:null, moveu:false,
            offCols: Math.max(0, Math.floor((e.clientX-cx.left)/dep.COL)) };
    const g = el.cloneNode(true);
    g.className = "barra-op fantasma"; g.style.width = cx.width+"px"; g.style.height = cx.height+"px";
    g.style.left = cx.left+"px"; g.style.top = cx.top+"px"; g.style.background = el.style.background;
    dep.raiz.appendChild(g); arr.g = g;
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once:true });
    e.preventDefault();
  }
  function mover(e){
    if(!arr) return;
    if(!arr.moveu && Math.abs(e.clientX-arr.x0)+Math.abs(e.clientY-arr.y0) < 5) return;
    if(!arr.moveu){ arr.moveu = true; arr.el.classList.add("arrastando"); document.body.style.userSelect="none"; }
    autoRolar(e, arr);
    arr.g.style.left = (e.clientX-arr.dx)+"px";
    arr.g.style.top  = (e.clientY-arr.dy)+"px";
    arr.g.style.display="none";
    const sob = document.elementFromPoint(e.clientX, e.clientY);
    arr.g.style.display="";
    limparAlvos(); arr.alvo = null;
    const cel = sob && sob.closest(".cel"), lin = sob && sob.closest(".linha[data-row]");
    if(!cel || !lin) return;
    const setor = lin.dataset.setor, rec = lin.dataset.rec || null;
    arr.bloqueado = setor===arr.r.setor && setor==='MONTAGEM' && !!rec && !arr.r.terceiroRecebido && arr.r.itens.some(i=>i.prontidao?.pronto!==true);
    const permitido = setor === arr.r.setor && !arr.bloqueado;
    const dur = arr.r.fim - arr.r.ini + 1;
    const cels = [...lin.querySelectorAll(".cel")];
    // ⚠ SOLTAR NO FIM DE SEMANA ESCORREGA PARA A SEGUNDA. Matheus (05/09/2026): "os
    // sábados e domingo por padrão pule eles". Mover o bloco é a operação de todo dia e
    // não pode plantar trabalho no sábado por descuido; para isso existe a ponta da
    // barra, que é deliberada. A prévia já mostra onde vai cair, então não há surpresa
    // depois de soltar.
    const jBruto = Math.max(0, cels.indexOf(cel) - arr.offCols);
    const j = Math.max(0, dep.encostaNoUtil(dep.getInicio() + jBruto) - dep.getInicio());
    for(let k=0;k<dur;k++){ const c = cels[j+k]; if(c) c.classList.add(permitido?"alvo":"proibido"); }
    if(!permitido || !cels[j]) return;
    arr.alvo = { setor, recurso:rec, iAlvo: dep.getInicio() + j };
    const rc = cels[j].getBoundingClientRect();
    arr.g.style.left = (rc.left+3)+"px"; arr.g.style.top = (rc.top+5)+"px"; arr.g.style.width = (dur*dep.COL-7)+"px";
  }
  function soltar(){
    window.removeEventListener("pointermove", mover);
    if(!arr) return;
    if(arr.raf) cancelAnimationFrame(arr.raf);
    arr.g.remove(); arr.el.classList.remove("arrastando"); limparAlvos();
    document.body.style.userSelect = "";
    const a = arr.alvo, r = arr.r, moveu = arr.moveu, bloqueado = arr.bloqueado; arr = null;
    if(!moveu){ dep.abrirPainel(r); return; }
    if(!a){
      if(bloqueado){dep.avisar(false,'Há conjuntos com croqui/corte pendente. Selecione os aptos para liberar parcialmente.');dep.abrirPainel(r);}
      else dep.desenhar();
      return;
    }
    const delta = a.iAlvo - r.ini;
    if(delta===0 && a.recurso===r.recurso){ dep.desenhar(); return; }
    const antes = r.lotes.map(l=>({...l, itens:l.itens}));
    // Cair num sábado escorrega para a segunda. A guarda do `dep.fdsISO(l.dia)` cobre o lote
    // que JÁ esteja num fim de semana — só se veio assim do banco, programado por fora
    // desta tela: mover o bloco não é lugar de desfazer isso em silêncio.
    const novos = r.lotes.map(l=>{
      const cru = Math.max(0, Math.min(dep.DIAS.length-1, dep.IDX.get(l.dia)+delta));
      const destino = dep.fdsISO(l.dia) ? cru : dep.encostaNoUtil(cru);
      return dep.novoLote({ ...l, itens:l.itens, recurso: a.recurso, dia: dep.DIAS[destino] });
    });
    dep.registrar({
      setor:r.setor, op:r.op, pecas:r.pecas, kg:r.kg,
      rotulo: (r.recurso!==a.recurso ? '<b>'+dep.nomeRec(r.setor,r.recurso)+'</b><span class="seta">→</span><b>'+dep.nomeRec(a.setor,a.recurso)+'</b> · ' : '<b>'+dep.nomeRec(a.setor,a.recurso)+'</b> · ')
             + (delta ? '<b>'+dep.dbr(dep.DIAS[r.ini])+'</b><span class="seta">→</span><b>'+dep.dbr(dep.DIAS[r.ini+delta])+'</b>' : '<b>'+dep.dbr(dep.DIAS[r.ini])+'</b>'),
      antes, novos,
    });
    if(dep.getPainel() && dep.getPainel().setor===r.setor && dep.getPainel().op===r.op && dep.getPainel().ini===r.ini)
      dep.setPainel({ setor:r.setor, recurso:a.recurso, op:r.op, ini:r.ini+delta, origem:r.origem||"" });
    dep.redesenhar();
  }

  /** solta tudo que o gesto pendurou no window (chamado pelo cleanup do React) */
  function encerrar(){
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    if(arr?.raf) cancelAnimationFrame(arr.raf);
    document.body.style.userSelect = "";
  }

  return { pegar, encerrar };
}
