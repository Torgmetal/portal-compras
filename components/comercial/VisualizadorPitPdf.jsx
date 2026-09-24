"use client";
import {useEffect, useRef, useState} from 'react';

// Renderiza os bytes do PDF original: conserva imagens, fontes e diagramação.
export default function VisualizadorPitPdf({src}) {
 const recipiente=useRef(null),canvas=useRef(null);
 const [pdf,setPdf]=useState(null),[pagina,setPagina]=useState(1),[largura,setLargura]=useState(800),[zoom,setZoom]=useState(1);
 const [erro,setErro]=useState(''),[tentativa,setTentativa]=useState(0),[renderizando,setRenderizando]=useState(true);
 useEffect(()=>{
  const observer=new ResizeObserver(([entry])=>setLargura(Math.max(200,entry.contentRect.width-24)));
  if(recipiente.current)observer.observe(recipiente.current);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  let ativo=true,tarefa;const abort=new AbortController();
  setPdf(null);setPagina(1);setErro('');setRenderizando(true);
  (async()=>{
   try{
    const resposta=await fetch(src,{signal:abort.signal,cache:'no-store'});
    if(!resposta.ok)throw new Error('Falha ao abrir o PDF.');
    const dados=new Uint8Array(await resposta.arrayBuffer());
    const {resolvePDFJS}=await import('unpdf/pdfjs');
    if(!ativo)return;
    const {getDocument}=await resolvePDFJS();
    if(!ativo)return;
    tarefa=getDocument({data:dados,isEvalSupported:false,useSystemFonts:true});
    const documento=await tarefa.promise;
    if(ativo)setPdf(documento);
   }catch(e){if(ativo&&e.name!=='AbortError')setErro('Não foi possível abrir o PDF. Tente novamente.');}
  })();
  return()=>{ativo=false;abort.abort();tarefa?.destroy();};
 },[src,tentativa]);
 useEffect(()=>{
  if(!pdf)return;
  let ativo=true,tarefa;
  setRenderizando(true);
  (async()=>{
   try{
    const folha=await pdf.getPage(pagina);
    if(!ativo)return;
    const base=folha.getViewport({scale:1});
    const viewport=folha.getViewport({scale:largura/base.width*zoom});
    const dpr=Math.min(window.devicePixelRatio||1,2);
    // Canvas próprio por renderização evita disputas ao mudar rapidamente de página.
    const elemento=document.createElement('canvas');
    elemento.width=Math.ceil(viewport.width*dpr);elemento.height=Math.ceil(viewport.height*dpr);
    elemento.style.width=`${viewport.width}px`;elemento.style.height=`${viewport.height}px`;
    elemento.setAttribute('role','img');elemento.setAttribute('aria-label',`Página ${pagina} do PIT`);
    tarefa=folha.render({canvasContext:elemento.getContext('2d'),viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]});
    await tarefa.promise;
    if(ativo){canvas.current.replaceChildren(elemento);setRenderizando(false);}
   }catch(e){if(ativo&&e.name!=='RenderingCancelledException')setErro('Não foi possível exibir esta página. Tente novamente.');}
  })();
  return()=>{ativo=false;tarefa?.cancel();};
 },[pdf,pagina,largura,zoom]);
 const botao='rounded-lg border bg-white px-3 py-2 text-sm text-torg-blue disabled:opacity-40';
 return <section ref={recipiente} className="min-w-0 rounded-lg border bg-gray-50" aria-label="Visualizador do PIT">
  {pdf&&!erro&&<div className="flex flex-wrap items-center justify-between gap-2 border-b p-2">
   <div className="flex items-center gap-2"><button className={botao} aria-label="Página anterior" disabled={pagina===1} onClick={()=>setPagina(p=>p-1)}>←</button><span className="text-sm">Página {pagina} de {pdf.numPages}</span><button className={botao} aria-label="Próxima página" disabled={pagina===pdf.numPages} onClick={()=>setPagina(p=>p+1)}>→</button></div>
   <label className="text-sm">Zoom <select aria-label="Zoom do PDF" className={botao} value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Ajustar à largura</option><option value={1.5}>150%</option><option value={2}>200%</option><option value={3}>300%</option></select></label>
  </div>}
  {erro?<div role="alert" className="p-6 text-center"><p>{erro}</p><button className={`${botao} mt-3`} onClick={()=>setTentativa(t=>t+1)}>Tentar novamente</button></div>:<>
   {renderizando&&<p role="status" className="p-3 text-center text-sm text-torg-gray">Carregando página…</p>}
   <div className="max-h-[75vh] overflow-auto p-3"><div ref={canvas} className={renderizando?'hidden':'w-max mx-auto bg-white shadow-sm'}/></div>
  </>}
 </section>;
}
