"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, Trash2, Loader2, AlertCircle } from "lucide-react";

export default function OPAcoesClient({ opId, numero, status, qtdRMs, isAdmin }) {
  const router = useRouter();
  const [loading, setLoading] = useState(null);
  const [erro, setErro] = useState("");

  const encerradaOuCancelada = status === "ENCERRADA" || status === "CANCELADA";

  async function executar(acao) {
    const confirms = {
      finalizar: `Finalizar a OP ${numero}? Ela some das listas ativas mas continua acessivel pelo historico.`,
      reabrir: `Reabrir a OP ${numero}? Ela volta pra lista ativa.`,
    };
    if (!window.confirm(confirms[acao])) return;
    setErro("");
    setLoading(acao);
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
      setErro(e.message);
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
    setErro("");
    setLoading("excluir");
    try {
      const res = await fetch(`/api/comercial/op/${opId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir");
      router.push("/compras/painel-ops");
    } catch (e) {
      setErro(e.message);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 pt-5 border-t border-gray-100">
        {encerradaOuCancelada ? (
          <button
            onClick={() => executar("reabrir")}
            disabled={!!loading}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {loading === "reabrir" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Reabrir OP
          </button>
        ) : (
          <button
            onClick={() => executar("finalizar")}
            disabled={!!loading}
            className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange-700 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {loading === "finalizar" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Finalizar OP
          </button>
        )}

        {isAdmin && (
          <button
            onClick={excluir}
            disabled={!!loading}
            title={qtdRMs > 0 ? "OP tem RMs vinculadas — use Cancelar pelo Comercial" : "Excluir definitivamente"}
            className="px-4 py-2 bg-white border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {loading === "excluir" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Excluir
          </button>
        )}
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}
    </div>
  );
}
