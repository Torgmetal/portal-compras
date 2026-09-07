"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { baixarZipLote } from "@/lib/desenhos-zip-cliente";
import { CSS } from "./_gantt/css";
import { MARKUP } from "./_gantt/markup";
import { RECURSOS, SETORES, COR_SETOR, FATOR_META, capDe, nomeRec, criarCores } from "./_gantt/recursos";
import { montarCalendario, d0, DSEM, MES, dbr, nkg, n1 } from "./_gantt/calendario";
import { criarQuebra } from "./_gantt/quebra";
import { criarPainelProjetos } from "./_gantt/painel-projetos";
import { criarArraste } from "./_gantt/arraste";
import { criarGrade } from "./_gantt/grade";
import { criarAtraso } from "./_gantt/atraso";
import { criarLotes } from "./_gantt/lotes";

// ─── O QUADRO DE PROGRAMAÇÃO DO PCP ────────────────────────────────────────────────────────────
//
// Vitor (05/09/2026): "na página do PCP, quero que crie acima desse painel um gantt que seja
// visualmente fácil de ver… eu preciso ter como arrastar essa barra do gantt para poder programar
// ela"; depois: "ao clicar nessas barras você precisa trazer os projetos que estão programados e
// deixar fazer a impressão deles novamente caso não tenha sido impresso ainda, e é preciso podermos
// quebrar essa programação em mais bancadas caso corra algum atraso"; e "na parte das datas você
// consegue congelar como se fosse uma planilha para podermos ver essas datas em todos os setores".
//
// ⚠⚠ POR QUE ESTE COMPONENTE NÃO É JSX POR DENTRO. O quadro é uma superfície de desenho: centenas
// de barras posicionadas em pixel, arraste com captura de ponteiro, fantasma que cola na grade,
// auto-rolagem na borda e recálculo de ocupação a cada movimento. Reconstruir isso com estado do
// React re-renderizaria a grade inteira a cada pointermove — e o protótipo que o Vitor validou
// ficaria diferente, que é justamente o que ele pediu para não acontecer ("quero esse mesmo layout,
// nada diferente"). Então o React cuida da BORDA (buscar, avisar, recarregar) e entrega um <div>
// para o desenho imperativo cuidar do resto. O código aqui dentro é o mesmo do protótipo.
//
// ⚠ O CSS é embutido e todo prefixado por `.gpcp`: são regras de grade/faixa/barra que não existem
// no Tailwind do portal, e sem o prefixo elas vazariam para o resto da tela do PCP.
//
// ⚠ NÃO INVENTA PROGRAMAÇÃO: lê e grava os mesmos campos que as telas de corte, montagem e solda já
// usam (ver lib/gantt-pcp.js). Arrastar para frente conta adiamento; para trás, não.



function iniciar(raiz, LOTES, HOJE, ajuda) {
  const $ = (id) => raiz.querySelector("#gp-" + id);
  const { avisar, recarregar, baixarZip } = ajuda;

  // JANELA 14 = duas semanas CHEIAS agora que sábado e domingo têm coluna. Com 13 a
  // grade cortava no meio de uma semana e o olho perdia o ritmo de sete.
  const COL = 106, JANELA = 14, MAX_LOTE = 80;

  const { corDaOp, tintaOp } = criarCores(LOTES);


  const { DIAS, IDX, fdsISO, encostaNoUtil, diasDaQuebra } = montarCalendario(LOTES, HOJE);

  /* ── estado ─────────────────────────────────────────────────────────────────── */
  let seq = 0;
  const novoLote = (o)=>({ ...o, uid:"L"+(++seq) });
  let lotes = LOTES.map(l=>novoLote({ ...l, recursoOrig:l.recurso, diaOrig:l.dia }));
  let alteracoes = [], setoresOn = new Set(SETORES), regua = "normal", inicio = 0;
  let painel = null, abaP = "projetos";
  const estado = new Map();

  // ⚠ QUATRO SETORES SE MEDEM EM KG, dois em bancada-dia. Corte, acabamento, jato e pintura têm capacidade do
  // RECURSO em kg/dia (a máquina, ou a bancada única do setor), então o custo do lote é o próprio
  // peso. Montagem e solda medem PEÇA POR FAIXA DE PESO, e o custo vem das libs de capacidade —
  // misturar as duas réguas foi o que fez a montagem parecer folgada com 24 t de peça graúda.
  const POR_KG = new Set(["CORTE","ACABAMENTO","JATO","PINTURA"]);
  const custoLote = (l)=> POR_KG.has(l.setor) ? l.kg : l.custo * (regua==="meta" ? FATOR_META[l.setor] : 1);
  const custoItem = (it, setor)=> POR_KG.has(setor) ? it.kg : it.c * (regua==="meta" ? FATOR_META[setor] : 1);

  // ⚠ `custoLote` entra como FUNÇÃO porque fecha sobre a régua (normal × meta), que o usuário troca
  // no botão. Passar o valor congelaria o custo na montagem do quadro.
  const { mesclar, recalc, montarRuns, acharRun, carga, ocup, classeOc, rotuloOc } = criarLotes({
    IDX, capDe, custoLote,
    getLotes: ()=>lotes, setLotes: (v)=>{ lotes = v; }, getSetoresOn: ()=>setoresOn });

  function janelaMaisCheia(){
    const peso = new Map();
    for(const l of lotes){ if(!setoresOn.has(l.setor)) continue;
      const i = IDX.get(l.dia); if(i==null) continue; peso.set(i,(peso.get(i)||0)+l.pecas); }
    if(!peso.size) return 0;
    let melhor=0, soma=-1;
    for(const i of peso.keys()){ const ini=Math.max(0,i-1); let s=0;
      for(let k=ini;k<ini+JANELA;k++) s+=peso.get(k)||0; if(s>soma){soma=s;melhor=ini;} }
    return melhor;
  }
  function janelaDeHoje(){
    const i = DIAS.findIndex(d=>d>=HOJE);
    return Math.max(0, Math.min(DIAS.length-JANELA, (i<0?DIAS.length-JANELA:i)-2));
  }
  inicio = janelaDeHoje();



  /* ── aplicar / desfazer ─────────────────────────────────────────────────────── */
  function registrar(alt){
    for(const l of alt.antes){ const i = lotes.findIndex(x=>x.uid===l.uid); if(i>=0) lotes.splice(i,1); }
    for(const n of alt.novos) lotes.push(recalc(n));
    mesclar();
    alt.depois = alt.novos.map(n=>({ recurso:n.recurso, dia:n.dia, ids:n.itens.map(i=>i.id) }));
    alt.ids = new Set(alt.antes.flatMap(l=>l.itens.map(i=>i.id)));
    alteracoes.push(alt);
  }
  function desfazer(i){
    const a = alteracoes[i]; if(!a) return;
    if(alteracoes.slice(i+1).some(b=>[...b.ids].some(id=>a.ids.has(id)))){
      alert("Há uma alteração mais recente sobre as mesmas peças.\nDesfaça primeiro a de baixo.");
      return;
    }
    const restantes = [];
    for(const l of lotes){
      const fica = l.itens.filter(x=>!a.ids.has(x.id));
      if(fica.length === l.itens.length){ restantes.push(l); continue; }
      if(fica.length){ l.itens = fica; restantes.push(recalc(l)); }
    }
    lotes = restantes;
    for(const l of a.antes) lotes.push(novoLote({ ...l, itens:l.itens }));
    mesclar();
    alteracoes.splice(i,1);
    redesenhar();
  }
  /* ⚠ estes dois handlers moravam DENTRO de `redesenhar`, que não roda no init: "Atualizar" e "Tela
     cheia" ficavam mortos até o usuário navegar o período ou arrastar alguma barra. */
  $("recarregar").onclick = ()=>recarregar();
  $("cheio").onclick = ()=>{
    const c = raiz.classList.toggle("cheio");
    $("cheio").textContent = c ? "Sair da tela cheia" : "Tela cheia";
    desenhar();
  };

  // ⚠ CICLO RESOLVIDO AQUI: a grade precisa do `pegar` do arraste para ligar o pointerdown de cada
  // barra, e o arraste precisa redesenhar depois de soltar. `desenhar` é declaração de função
  // (içada) e a vista é atribuída depois — quando alguém chama, os dois já existem.
  const grade = $("grade");
  let vista = null;
  function desenhar(){ if(vista) vista.desenhar(); }
  function redesenhar(){ desenhar(); pintarAlteracoes(); atraso.pintarEmpurrao(); if(painel) pintarPainel(); }

  function pintarAlteracoes(){
    const ul = $("listaAlt");
    $("nAlt").textContent = alteracoes.length;
    $("semAlt").style.display = alteracoes.length ? "none" : "";
    for(const b of ["desfazer","limpar","salvar"]) $(b).disabled = !alteracoes.length;
    ul.innerHTML = alteracoes.map((a,i)=>
      '<li><span class="tag" style="background:'+COR_SETOR[a.setor]+'">'+a.setor+'</span>'
      + '<b>OP-'+a.op+'</b><span class="de-para">'+a.rotulo+'</span>'
      + '<span class="de-para">'+a.pecas+' pç · '+nkg(a.kg)+' kg</span>'
      + '<button class="li-x" data-i="'+i+'" title="desfazer esta">✕</button></li>').join("");
    for(const b of ul.querySelectorAll(".li-x")) b.onclick = ()=>desfazer(+b.dataset.i);
  }

  /* ── painel: projetos + quebra ──────────────────────────────────────────────── */
  function abrirPainel(r){
    painel = { setor:r.setor, recurso:r.recurso, op:r.op, ini:r.ini };
    abaP = "projetos"; projetos.reiniciar();
    quebra.reiniciar(r);
    $("painel").hidden = false;
    desenhar(); pintarPainel();
  }
  /* separado do `fecharPainel` porque a quebra fecha o painel e JÁ redesenha em seguida —
     chamar os dois faria a grade ser montada duas vezes a cada divisão aplicada. */
  const esconderPainel = ()=>{ painel = null; $("painel").hidden = true; };
  function fecharPainel(){ esconderPainel(); desenhar(); }

  // ⚠ construído aqui, e não lá em cima, porque recebe FUNÇÕES de `iniciar` (ocup, carga, registrar…)
  // que precisam já existir. São elas que fecham sobre `lotes` e `regua` — o módulo da quebra não
  // conhece o estado do quadro, só os helpers que sabem lê-lo.
  const quebra = criarQuebra({ $, raiz, RECURSOS, DIAS, capDe, nomeRec, nkg, dbr, fdsISO, diasDaQuebra,
    ocup, carga, custoItem, classeOc, rotuloOc, novoLote, registrar, redesenhar, pintarPainel,
    esconderPainel });
  const projetos = criarPainelProjetos({ $, raiz, nkg, dbr, MAX_LOTE, avisar, recarregar, baixarZip,
    pintarPainel });
  const arraste = criarArraste({ raiz, grade, COL, DIAS, IDX, encostaNoUtil, fdsISO, montarRuns,
    novoLote, registrar, nomeRec, dbr, abrirPainel, desenhar, redesenhar,
    getInicio: ()=>inicio, getPainel: ()=>painel, setPainel: (v)=>{ painel = v; } });
  const atraso = criarAtraso({ $, capDe, custoLote, HOJE, DIAS, IDX, montarRuns, novoLote, registrar,
    nomeRec, dbr, fdsISO, encostaNoUtil, redesenhar, getLotes: ()=>lotes });
  vista = criarGrade({ $, grade, montarRuns, DIAS, JANELA, COL, d0, HOJE, fdsISO, DSEM, MES, SETORES,
    RECURSOS, nkg, empurraoDoRecurso: atraso.empurraoDoRecurso, loteAtrasado: atraso.loteAtrasado,
    IDX, corDaOp, tintaOp, dbr, ocup, classeOc,
    rotuloOc, estado, getInicio: ()=>inicio, getPainel: ()=>painel, getSetoresOn: ()=>setoresOn,
    pegar: ()=>arraste.pegar });

  function pintarPainel(){
    const r = acharRun(painel);
    if(!r){ fecharPainel(); return; }
    const dias = r.dias;
    $("pOp").textContent = "OP-"+r.op;
    $("pObra").textContent = r.obra || "";
    $("pSub").innerHTML =
      nomeRec(r.setor, r.recurso)+" · " + (dias>1 ? dbr(DIAS[r.ini])+" a "+dbr(DIAS[r.fim])+" ("+dias+" dias)" : dbr(DIAS[r.ini]))
      + " · " + r.pecas.toLocaleString("pt-BR")+" peças · "+nkg(r.kg)+" kg"
      + (r.setor==="CORTE" ? "" : " · "+n1(r.custo)+" dias-bancada")
      + " · <b>"+r.feitas.toLocaleString("pt-BR")+" de "+r.pecas.toLocaleString("pt-BR")+" feitas</b>"
      + " ("+Math.round((r.pecas>0?r.feitas/r.pecas:0)*100)+"%)";
    for(const b of raiz.querySelectorAll(".abas button")) b.classList.toggle("on", b.dataset.aba===abaP);
    if(abaP==="projetos") projetos.pintarProjetos(r); else quebra.pintarQuebra(r);
  }

  /* ── o que seria gravado ────────────────────────────────────────────────────── */
  $("salvar").onclick = async ()=>{
    if(!alteracoes.length) return;
    const blocos = [];
    for(const a of alteracoes) for(const d of a.depois) blocos.push({ setor:a.setor, ids:d.ids, recurso:d.recurso, dia:d.dia });
    const pecas = alteracoes.reduce((s,a)=>s+a.pecas,0);
    if(!confirm("Gravar "+alteracoes.length+" alteração(ões) de programação ("+pecas+" peças)?\n\nIsto muda o dia e o recurso das peças no portal.")) return;
    const b = $("salvar"); b.disabled = true; b.textContent = "Salvando…";
    try{
      const res = await fetch("/api/pcp/gantt", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ blocos }) });
      const j = await res.json();
      if(!res.ok) throw new Error(j.error || "Erro ao salvar");
      avisar(true, j.total+" peça(s) reprogramada(s).");
      alteracoes = [];
      await recarregar();
    }catch(e){ avisar(false, e.message); b.disabled=false; }
    finally{ b.textContent = "Salvar programação"; }
  };

  $("desfazer").onclick = ()=>desfazer(alteracoes.length-1);
  $("limpar").onclick = ()=>{ for(let k=alteracoes.length-1;k>=0;k--) desfazer(k); };

  /* ── controles ──────────────────────────────────────────────────────────────── */
  // 7 e não 5: o botão diz "Semana", e semana agora tem sete colunas.
  $("ant").onclick = ()=>{ inicio=Math.max(0,inicio-7); redesenhar(); };
  $("prox").onclick = ()=>{ inicio=Math.min(DIAS.length-JANELA,inicio+7); redesenhar(); };
  $("agora").onclick = ()=>{ inicio = janelaMaisCheia(); redesenhar(); };
  for(const b of raiz.querySelectorAll(".barra [data-setor]")){
    b.onclick = ()=>{ const s=b.dataset.setor;
      if(setoresOn.has(s)) setoresOn.delete(s); else setoresOn.add(s);
      b.classList.toggle("on", setoresOn.has(s)); redesenhar(); };
  }
  $("regua").onclick = ()=>{
    regua = regua==="normal" ? "meta" : "normal";
    const b=$("regua");
    b.textContent = regua==="normal" ? "Ritmo normal" : "Ritmo meta";
    b.classList.toggle("on", regua==="normal"); redesenhar();
  };
  grade.addEventListener("click",(e)=>{
    const t = e.target.closest("[data-toggle]"); if(!t) return;
    const s=t.dataset.toggle;
    estado.set(s, grade.querySelector('[data-setor="'+s+'"]') ? "f" : "a"); desenhar();
  });
  $("pFechar").onclick = fecharPainel;
  for(const b of raiz.querySelectorAll(".abas button")) b.onclick = ()=>{ abaP=b.dataset.aba; pintarPainel(); };
  const aoTeclar = (e)=>{ if(e.key==="Escape" && painel) fecharPainel(); };
  window.addEventListener("keydown", aoTeclar);

  $("empurrar").onclick = atraso.aplicarEmpurrao;
  atraso.pintarEmpurrao();

  desenhar(); pintarAlteracoes();

    return () => {
      window.removeEventListener("keydown", aoTeclar);
      arraste.encerrar();
    };

}

export default function GanttProgramacao() {
  const caixa = useRef(null);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/pcp/gantt");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar a programação");
      setDados(j);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  // ⚠ o quadro é remontado do zero a cada carga: é o que garante que "Salvar" e "Imprimir" mostrem
  // o estado que está no banco, sem sobrar alteração pendente de uma sessão que já foi gravada.
  useEffect(() => {
    const raiz = caixa.current;
    if (!raiz || !dados) return;
    raiz.innerHTML = MARKUP;
    const avisar = (ok, texto) => {
      const el = raiz.querySelector("#gp-aviso");
      if (!el) return;
      el.innerHTML = "";
      const d = document.createElement("div");
      d.className = "avisoTela " + (ok ? "ok" : "ruim");
      d.innerHTML = "<span>" + String(texto).replace(/</g, "&lt;") + "</span>";
      const x = document.createElement("button");
      x.textContent = "fechar"; x.onclick = () => { el.innerHTML = ""; };
      d.appendChild(x); el.appendChild(d);
    };
    const limpar = iniciar(raiz, dados.lotes, dados.hoje, {
      avisar, recarregar: buscar, baixarZip: baixarZipLote,
    });
    return () => { if (typeof limpar === "function") limpar(); raiz.innerHTML = ""; };
  }, [dados, buscar]);

  if (carregando && !dados) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-8 flex items-center justify-center gap-3 text-torg-gray">
        <Loader2 size={20} className="animate-spin" /> Carregando a programação…
      </div>
    );
  }
  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle size={16} /> {erro}
        <button onClick={buscar} className="ml-auto text-xs underline">tentar de novo</button>
      </div>
    );
  }
  return (
    <>
      <style>{CSS}</style>
      <div className="gpcp" ref={caixa} />
    </>
  );
}
