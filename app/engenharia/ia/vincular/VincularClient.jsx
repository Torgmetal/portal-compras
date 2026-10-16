"use client";
import { useState } from "react";
import { Laptop, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

// Ligar o PC à conta (F1 do app Torg Engenharia): o app mostra um código TRG-XXXX; aqui o projetista prende esse
// código à conta dele, e o pedido vai para o administrador do portal aprovar (Vitor, 16/10/2026: só ADMIN aprova).
export default function VincularClient() {
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(null);

  async function vincular(e) {
    e.preventDefault();
    setErro(""); setEnviando(true);
    try {
      const r = await fetch("/api/engenharia-ia/aparelho/vincular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível vincular.");
      setFeito(d.nome);
    } catch (e2) { setErro(e2.message); } finally { setEnviando(false); }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2"><Laptop size={22} className="text-torg-blue" /> Ligar este PC à IA da Engenharia</h1>
      <p className="text-sm text-torg-gray mt-1">Digite o código que o app Torg Engenharia mostrou no seu computador. Depois, o administrador do portal aprova e o app passa a funcionar.</p>
      {feito ? (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 flex items-start gap-2">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span><b>{feito}</b> foi ligado à sua conta e está aguardando a aprovação do administrador. Deixe o app aberto: ele libera sozinho quando for aprovado.</span>
        </div>
      ) : (
        <form onSubmit={vincular} className="mt-6 bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-torg-dark">Código do app</span>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="TRG-4F7K" maxLength={12} autoFocus autoComplete="off"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-lg font-mono tracking-widest focus:ring-2 focus:ring-torg-blue outline-none" />
          </label>
          {erro && <p className="text-sm text-red-700 flex items-center gap-1.5" role="alert"><AlertCircle size={15} /> {erro}</p>}
          <button disabled={enviando || codigo.trim().length < 4} className="w-full px-4 py-2.5 rounded-lg bg-torg-blue text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {enviando && <Loader2 size={16} className="animate-spin" />} Ligar este PC
          </button>
          <p className="text-xs text-torg-gray">O código vale por 10 minutos. Se expirou, gere outro no app.</p>
        </form>
      )}
    </div>
  );
}
