"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, CheckCircle2, RotateCcw, Trash2, Loader2 } from "lucide-react";

export default function OPRowActions({ opId, numero, status, qtdRMs, isAdmin }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [loading, setLoading] = useState(null);
  const ref = useRef(null);

  const encerradaOuCancelada = status === "ENCERRADA" || status === "CANCELADA";

  useEffect(() => {
    function onClickOut(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    if (aberto) document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, [aberto]);

  async function executar(acao) {
    const confirms = {
      finalizar: `Finalizar a OP ${numero}? Ela some das listas ativas mas continua acessivel pelo historico.`,
      reabrir: `Reabrir a OP ${numero}? Ela volta pra lista ativa.`,
    };
    if (!window.confirm(confirms[acao])) return;
    setLoading(acao);
    setAberto(false);
    try {
      const res = await fetch(`/api/comercial/op/${opId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function excluir() {
    if (!window.confirm(
      `EXCLUIR DEFINITIVAMENTE a OP ${numero}?\n\n` +
      `Apaga itens, aditivos, revisoes e ajustes de prazo.\n` +
      `So funciona se a OP nao tiver RMs vinculadas.\n\n` +
      `Essa acao NAO PODE ser desfeita.`
    )) return;
    setLoading("excluir");
    setAberto(false);
    try {
      const res = await fetch(`/api/comercial/op/${opId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir");
      router.refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setAberto((v) => !v); }}
        disabled={!!loading}
        className="p-1.5 rounded hover:bg-gray-100 text-torg-gray hover:text-torg-dark disabled:opacity-50"
        aria-label="Ações"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <MoreVertical size={16} />}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
          {encerradaOuCancelada ? (
            <button
              type="button"
              onClick={() => executar("reabrir")}
              className="w-full px-3 py-2 text-left text-sm text-torg-blue hover:bg-torg-blue-50 flex items-center gap-2"
            >
              <RotateCcw size={14} /> Reabrir OP
            </button>
          ) : (
            <button
              type="button"
              onClick={() => executar("finalizar")}
              className="w-full px-3 py-2 text-left text-sm text-torg-orange-700 hover:bg-torg-orange-50 flex items-center gap-2"
            >
              <CheckCircle2 size={14} /> Finalizar OP
            </button>
          )}

          {isAdmin && (
            <>
              <div className="my-1 h-px bg-gray-100" />
              <button
                type="button"
                onClick={excluir}
                title={qtdRMs > 0 ? "OP tem RMs vinculadas — use Cancelar" : "Excluir definitivamente"}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 size={14} /> Excluir
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
