"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, XCircle, Loader2 } from "lucide-react";

// Menu kebab por linha de RM, usado nas listagens (/rm e /compras).
// Apenas ADMIN pode excluir; demais users veem o menu apenas com acoes
// que cabem ao seu role (no caso, hoje so excluir esta exposto pra ADMIN).
export default function RMRowActions({ rmId, numero, status, isAdmin, onAfterChange }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [loading, setLoading] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOut(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    if (aberto) document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, [aberto]);

  async function cancelarRM() {
    const motivo = window.prompt(
      `Cancelar a RM ${numero}?\n\nMotivo (será registrado no histórico):`
    );
    if (!motivo || !motivo.trim()) return;
    setLoading("cancelar");
    setAberto(false);
    try {
      let res = await fetch(`/api/rm/${rmId}/encerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      let data = await res.json();
      if (!res.ok && data.requiresForce) {
        const ok = window.confirm(
          `${data.error}\n\nConfirma que os pedidos no Omie já foram CANCELADOS POR LÁ?`
        );
        if (!ok) return;
        res = await fetch(`/api/rm/${rmId}/encerrar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: motivo.trim(), force: true }),
        });
        data = await res.json();
      }
      if (!res.ok) throw new Error(data.error || "Erro");
      onAfterChange ? onAfterChange() : router.refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function excluirRM() {
    if (!window.confirm(
      `EXCLUIR DEFINITIVAMENTE a RM ${numero}?\n\n` +
      `Apaga itens, cotações, envios e anexos.\n\n` +
      `Essa ação NÃO PODE ser desfeita.`
    )) return;
    setLoading("excluir");
    setAberto(false);
    try {
      let res = await fetch(`/api/rm/${rmId}`, { method: "DELETE" });
      let data = await res.json();
      if (!res.ok && data.requiresForce) {
        const ok = window.confirm(
          `${data.error}\n\nConfirma que os pedidos foram CANCELADOS no Omie?`
        );
        if (!ok) return;
        res = await fetch(`/api/rm/${rmId}?force=1`, { method: "DELETE" });
        data = await res.json();
      }
      if (!res.ok) throw new Error(data.error || "Erro ao excluir");
      onAfterChange ? onAfterChange() : router.refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(null);
    }
  }

  // Cancelar e excluir são exclusivos do ADMIN. PEDIDO_GERADO mostra
  // o botao mas a API pede confirmação extra antes de prosseguir.
  const podeCancelar = isAdmin && status !== "CANCELADA";

  if (!isAdmin) return null;

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
          {podeCancelar && (
            <button
              type="button"
              onClick={cancelarRM}
              className="w-full px-3 py-2 text-left text-sm text-torg-orange-700 hover:bg-torg-orange-50 flex items-center gap-2"
            >
              <XCircle size={14} /> Cancelar RM
            </button>
          )}

          {isAdmin && (
            <>
              {podeCancelar && <div className="my-1 h-px bg-gray-100" />}
              <button
                type="button"
                onClick={excluirRM}
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
