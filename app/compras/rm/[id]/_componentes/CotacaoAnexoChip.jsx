"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, FileText } from "lucide-react";

// Chip clicavel pra abrir/baixar anexo da cotacao + botao X pra remover.
export function CotacaoAnexoChip({ anexo, cotacaoId }) {
  const router = useRouter();
  const [removendo, setRemovendo] = useState(false);
  const tamMb = anexo.tamanho ? (anexo.tamanho / (1024 * 1024)).toFixed(2) : null;
  const remover = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Remover o anexo "${anexo.nomeArquivo}"? Essa ação não pode ser desfeita.`)) return;
    setRemovendo(true);
    try {
      const res = await fetch(`/api/cotacao/${cotacaoId}/anexos/${anexo.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro");
      }
      router.refresh();
    } catch (err) {
      alert("Falha ao remover: " + err.message);
      setRemovendo(false);
    }
  };
  return (
    <span className="inline-flex items-center text-[11px] bg-torg-blue-50 text-torg-blue rounded border border-torg-blue-100 overflow-hidden">
      <a
        href={anexo.blobUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-0.5 hover:bg-torg-blue-100"
        title={`${anexo.nomeArquivo}${tamMb ? ` · ${tamMb} MB` : ""}`}
      >
        <FileText size={11} />
        <span className="truncate max-w-[180px]">{anexo.nomeArquivo}</span>
      </a>
      <button
        type="button"
        onClick={remover}
        disabled={removendo}
        className="px-1.5 py-0.5 text-red-500 hover:text-white hover:bg-red-500 disabled:opacity-50 border-l border-torg-blue-100"
        title="Remover anexo"
      >
        {removendo ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
      </button>
    </span>
  );
}
