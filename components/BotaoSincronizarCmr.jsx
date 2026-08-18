"use client";
// "Atualizar CMR" — puxa a planilha de rastreabilidade do Almoxarifado do SharePoint e importa
// as linhas novas (dedupe por índice R). É o que mantém o STATUS DE COMPRA da Preparação em dia.
// Roda sozinho todo dia às 9h (cron); o botão é pro caso de o Almoxarifado acabar de lançar.
// Usado no Painel do PCP e na Qualidade › Rastreabilidade. (Vitor 18/08.)
import { useState } from "react";
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function BotaoSincronizarCmr({ onPronto, className = "" }) {
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, texto }

  async function sincronizar() {
    setRodando(true); setMsg(null);
    try {
      const r = await fetch("/api/qualidade/cmr/sincronizar", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao sincronizar");
      const txt = j.criados > 0
        ? `${j.criados} entrada(s) nova(s) do CMR importada(s).`
        : "CMR já estava em dia — nada novo.";
      setMsg({ ok: true, texto: txt });
      onPronto?.(j);
    } catch (e) {
      setMsg({ ok: false, texto: e.message });
    } finally {
      setRodando(false);
      setTimeout(() => setMsg(null), 8000);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={sincronizar} disabled={rodando}
        title="Puxa a planilha CMR do Almoxarifado (SharePoint) e importa os recebimentos novos. Atualiza o status de compra das OPs."
        className={className || "px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-1.5 disabled:opacity-50"}>
        {rodando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        {rodando ? "Atualizando CMR…" : "Atualizar CMR"}
      </button>
      {msg && (
        <span className={`text-[11px] inline-flex items-center gap-1 ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {msg.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />} {msg.texto}
        </span>
      )}
    </span>
  );
}
