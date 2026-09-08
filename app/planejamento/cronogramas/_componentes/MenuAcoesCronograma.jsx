"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

/** Menu de ações secundárias; mantém os callbacks e confirmações do cronograma. */
export function MenuAcoesCronograma({ titulo, icone: Icon, itens, direita = false }) {
  const ref = useRef(null);
  const painel = useRef(null);
  const [posicao, setPosicao] = useState({ left: 24, top: 0, width: 256 });
  const posicionar = () => {
    if (!ref.current || !painel.current) return;
    const ancora = ref.current.querySelector("summary").getBoundingClientRect();
    const width = Math.min(256, window.innerWidth - 48);
    const left = Math.max(24, Math.min(direita ? ancora.right - width : ancora.left, window.innerWidth - width - 24));
    const altura = painel.current.getBoundingClientRect().height;
    const top = ancora.bottom + 8 + altura <= window.innerHeight - 16 ? ancora.bottom + 8 : Math.max(16, ancora.top - altura - 8);
    setPosicao({ left, top, width });
  };
  useEffect(() => {
    const fecharFora = e => { if (ref.current && !ref.current.contains(e.target)) ref.current.open = false; };
    const fechar = () => { if (ref.current) ref.current.open = false; };
    document.addEventListener("pointerdown", fecharFora);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      document.removeEventListener("pointerdown", fecharFora);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, []);
  return (
    <details ref={ref} onToggle={posicionar} className="relative" onKeyDown={e => {
      if (e.key === "Escape") { e.preventDefault(); ref.current.open = false; ref.current.querySelector("summary").focus(); }
    }}>
      <summary onClick={() => { if (!ref.current.open) posicionar(); }} className="flex cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-torg-dark hover:bg-slate-50 focus-visible:outline-torg-blue [&::-webkit-details-marker]:hidden">
        {Icon && <Icon size={15}/>} {titulo} <ChevronDown size={13} className="text-torg-gray"/>
      </summary>
      <div ref={painel} style={posicao} className="fixed z-40 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
        {itens.filter(Boolean).map(item => {
          const ItemIcon = item.icone;
          return <button key={item.titulo} disabled={item.carregando || item.desabilitado} onClick={() => { ref.current.open = false; item.acao(); }} className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left disabled:opacity-50 ${item.perigo ? "text-red-600 hover:bg-red-50" : "text-torg-dark hover:bg-slate-50"}`}>
            {item.carregando ? <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin"/> : ItemIcon && <ItemIcon size={15} className="mt-0.5 shrink-0"/>}
            <span className="min-w-0"><span className="block text-xs font-medium">{item.titulo}</span>{item.descricao && <span className="mt-1 block text-xs leading-relaxed text-torg-gray">{item.descricao}</span>}</span>
          </button>;
        })}
      </div>
    </details>
  );
}
