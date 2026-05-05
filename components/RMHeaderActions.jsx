"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, XCircle, Loader2, AlertCircle, Unlink } from "lucide-react";

// Botoes maiores pra usar nas paginas de detalhe da RM (/rm/[id] e /compras/rm/[id])
export default function RMHeaderActions({ rmId, numero, status, isAdmin, temOP = false, onDeleteRedirect = "/rm" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(null);
  const [erro, setErro] = useState("");

  const podeCancelar = status !== "PEDIDO_GERADO" && status !== "CANCELADA";
  const podeDesvincular = temOP && (isAdmin || true /* COMPRAS pode pelo /compras/rm/ */);

  if (!isAdmin && !podeCancelar && !podeDesvincular) return null;

  async function desvincularDaOP() {
    if (!window.confirm(
      `Desvincular a RM ${numero} da OP atual?\n\n` +
      `A RM permanece, mas deixa de estar ligada a essa OP. ` +
      `Os vinculos de itens (com itens da OP/aditivo) tambem serao limpos.\n\n` +
      `Use isso quando quiser excluir a OP — depois de desvincular ` +
      `todas as RMs, a OP fica liberada pra exclusao.`
    )) return;
    setErro("");
    setLoading("desvincular");
    try {
      const res = await fetch(`/api/rm/${rmId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "desvincular" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function cancelarRM() {
    const motivo = window.prompt(
      `Cancelar a RM ${numero}?\n\nMotivo (será registrado no histórico):`
    );
    if (!motivo || !motivo.trim()) return;
    setErro("");
    setLoading("cancelar");
    try {
      const res = await fetch(`/api/rm/${rmId}/encerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function excluirRM() {
    if (!window.confirm(
      `EXCLUIR DEFINITIVAMENTE a RM ${numero}?\n\n` +
      `Apaga itens, cotações, envios e anexos.\n` +
      `Não funciona se a RM já gerou pedido no Omie.\n\n` +
      `Essa ação NÃO PODE ser desfeita.`
    )) return;
    setErro("");
    setLoading("excluir");
    try {
      const res = await fetch(`/api/rm/${rmId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir");
      router.push(onDeleteRedirect);
    } catch (e) {
      setErro(e.message);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {podeDesvincular && (
          <button
            type="button"
            onClick={desvincularDaOP}
            disabled={!!loading}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {loading === "desvincular" ? <Loader2 size={16} className="animate-spin" /> : <Unlink size={16} />}
            Desvincular da OP
          </button>
        )}

        {podeCancelar && (
          <button
            type="button"
            onClick={cancelarRM}
            disabled={!!loading}
            className="px-4 py-2 bg-white border border-torg-orange-200 text-torg-orange-700 text-sm rounded-lg hover:bg-torg-orange-50 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {loading === "cancelar" ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
            Cancelar RM
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={excluirRM}
            disabled={!!loading}
            className="px-4 py-2 bg-white border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {loading === "excluir" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Excluir
          </button>
        )}
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}
    </div>
  );
}
