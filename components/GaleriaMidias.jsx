"use client";
import { useEffect, useState } from "react";
import { ehVideo } from "@/lib/midia";

export default function GaleriaMidias({ itens = [] }) {
  const [indice, setIndice] = useState(0);
  const [auto, setAuto] = useState(false);
  const atual = itens[indice % (itens.length || 1)];
  useEffect(() => {
    if (!auto || !atual || ehVideo(atual) || itens.length < 2) return;
    const timer = setTimeout(() => setIndice((i) => (i + 1) % itens.length), 5000);
    return () => clearTimeout(timer);
  }, [auto, indice, atual, itens.length]);
  if (!atual) return null;
  const ir = (delta) => { setAuto(false); setIndice((i) => (i + delta + itens.length) % itens.length); };
  return <div className="space-y-3">
    <style>{`@keyframes torgMidiaEntrada { from { opacity: .3; } to { opacity: 1; } } .torg-midia-foto { animation: torgMidiaEntrada .35s ease-out; } @media (prefers-reduced-motion: reduce) { .torg-midia-foto { animation: none; } }`}</style>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-500">{indice % itens.length + 1} / {itens.length}</span>
      {itens.length > 1 && <><button onClick={() => ir(-1)} className="border rounded-lg px-3 py-2">Anterior</button><button onClick={() => ir(1)} className="border rounded-lg px-3 py-2">Próxima</button><button aria-pressed={auto} onClick={() => setAuto((v) => !v)} className="text-torg-blue border rounded-lg px-3 py-2">{auto ? "Pausar apresentação" : "Iniciar apresentação"}</button></>}
      <a href={atual.url} target="_blank" rel="noreferrer" className="ml-auto text-torg-blue">Abrir arquivo</a>
    </div>
    <figure className="rounded-xl border overflow-hidden bg-slate-950">
      {ehVideo(atual) ? <video key={atual.url} src={atual.url} poster={atual.miniatura} controls playsInline preload="none" className="w-full h-[360px] sm:h-[520px] object-contain" onEnded={() => { if (auto) setIndice((i) => (i+1)%itens.length); }} /> : <img key={atual.url} src={atual.url} alt={atual.legenda || "Foto da obra"} className="torg-midia-foto w-full h-[360px] sm:h-[520px] object-contain" />}
      {atual.legenda && <figcaption className="bg-white text-sm px-4 py-3 text-gray-600">{atual.legenda}</figcaption>}
    </figure>
    {itens.length > 1 && <div className="flex gap-2 overflow-x-auto pb-2">{itens.map((f,i) => <button key={`${f.url}-${i}`} aria-label={`Mostrar ${f.legenda || `registro ${i+1}`}`} aria-pressed={indice%itens.length===i} onClick={() => { setAuto(false); setIndice(i); }} className={`shrink-0 w-24 h-16 border-2 rounded-lg overflow-hidden ${indice%itens.length===i ? "border-torg-orange" : "border-transparent"}`}>
      {ehVideo(f) && !f.miniatura ? <span className="text-xs">Vídeo {i+1}</span> : <img loading="lazy" src={f.miniatura || f.url} alt="" className="w-full h-full object-cover" />}
    </button>)}</div>}
  </div>;
}
