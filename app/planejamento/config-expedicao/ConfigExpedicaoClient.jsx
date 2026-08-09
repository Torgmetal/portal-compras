"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, Plus, Trash2, List, AlertCircle } from "lucide-react";

export default function ConfigExpedicaoClient() {
  const [termos, setTermos] = useState(null);
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    fetch("/api/planejamento/expedicao/itens-excluidos")
      .then((r) => (r.ok ? r.json() : { termos: [] }))
      .then((j) => setTermos(j.termos || []))
      .catch(() => setTermos([]));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar(e) {
    e.preventDefault();
    const t = novo.trim();
    if (t.length < 2) return;
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/planejamento/expedicao/itens-excluidos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ termo: t }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao adicionar");
      setTermos(j.termos || []); setNovo("");
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function remover(id) {
    setErro("");
    const r = await fetch(`/api/planejamento/expedicao/itens-excluidos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const j = await r.json();
    if (r.ok) setTermos(j.termos || []); else setErro(j.error || "Erro ao remover");
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <a href="/planejamento/cronogramas" className="text-sm text-torg-gray hover:text-torg-blue inline-flex items-center gap-1">
        <ArrowLeft size={15} /> Cronogramas
      </a>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-xl font-extrabold text-torg-dark flex items-center gap-2"><List size={20} className="text-torg-blue" /> Itens fora da estrutura</h2>
          <p className="text-[13px] text-torg-gray mt-1.5 leading-relaxed">
            O <span className="font-semibold text-torg-dark">% de expedição da estrutura</span> no cronograma soma o peso (kg) das peças embarcadas.
            Itens listados aqui <span className="font-semibold text-torg-dark">não entram nessa conta</span> — porque têm linha própria
            (grade de piso) ou são medidos por unidade (telha, parafuso, steel deck, lanternim…). Se a descrição da peça
            contém um destes termos, ela fica fora do %.
          </p>
        </div>

        <div className="px-6 py-4 border-b border-gray-100">
          <form onSubmit={adicionar} className="flex gap-2">
            <input
              value={novo} onChange={(e) => setNovo(e.target.value)}
              placeholder="Ex.: steel deck, lanternim, cobertura…"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
            />
            <button type="submit" disabled={salvando || novo.trim().length < 2}
              className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Adicionar
            </button>
          </form>
          {erro && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>

        <div className="px-6 py-4">
          {termos === null ? (
            <div className="py-8 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
          ) : termos.length === 0 ? (
            <p className="text-[13px] text-torg-gray py-4">Nenhum termo — tudo com peso conta como estrutura.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {termos.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full pl-3 pr-1.5 py-1 text-[13px] text-torg-dark">
                  {t.termo}
                  <button onClick={() => remover(t.id)} title="Remover" className="p-0.5 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50">
                    <Trash2 size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-[11px] text-torg-gray mt-4">
            A mudança vale na próxima importação da lista de expedição do SharePoint (que realinha o cronograma).
          </p>
        </div>
      </div>
    </div>
  );
}
