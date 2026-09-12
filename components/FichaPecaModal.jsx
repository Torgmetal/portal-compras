"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import FichaPeca from "./FichaPeca";

/** Consulta compartilhada, sem alterar os apontamentos da peça. */
export default function FichaPecaModal({ opId, marca, onClose }) {
  const [estado, setEstado] = useState({ carregando: true });
  const [tentativa, setTentativa] = useState(0);
  const fechar = useRef(null);
  const painel = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fechar.current?.focus();
    function teclado(e) {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key !== "Tab") return;
      const itens = painel.current?.querySelectorAll('button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]');
      if (!itens?.length) return;
      const primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
    document.addEventListener("keydown", teclado);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", teclado); anterior?.focus?.(); };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setEstado({ carregando: true });
    async function carregar() {
      try {
        const res = await fetch(`/api/producao/peca?${new URLSearchParams({ opId, marca })}`, { cache: "no-store", signal: abort.signal });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.error || "Não foi possível consultar a peça.");
        if (!abort.signal.aborted) setEstado({ dados });
      } catch (e) {
        if (!abort.signal.aborted) setEstado({ erro: e.message || "Não foi possível consultar a peça." });
      }
    }
    carregar();
    return () => abort.abort();
  }, [opId, marca, tentativa]);
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-2 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={painel} role="dialog" aria-modal="true" aria-label={`Ficha da peça ${marca}`} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b p-4">
          <div className="min-w-0"><h2 className="font-bold text-torg-dark">Ficha da peça</h2><p className="text-sm text-torg-gray break-all">{marca}{estado.dados?.op?.numero ? ` · OP ${estado.dados.op.numero}` : ""}</p></div>
          <button ref={fechar} onClick={onClose} aria-label="Fechar ficha" className="min-h-11 min-w-11 flex items-center justify-center text-torg-gray"><X size={22}/></button>
        </header>
        <div className="overflow-y-auto min-h-0 p-4 sm:p-6">
          {estado.carregando && <p role="status" className="flex gap-2 text-torg-gray"><Loader2 className="animate-spin" size={20}/>Consultando a peça…</p>}
          {estado.erro && <div role="alert"><p className="text-red-700">{estado.erro}</p><button onClick={() => setTentativa(t => t + 1)} className="mt-3 min-h-11 px-4 border rounded-lg text-torg-blue">Tentar novamente</button></div>}
          {estado.dados && <FichaPeca d={estado.dados}/>}
        </div>
      </section>
    </div>, document.body,
  );
}
