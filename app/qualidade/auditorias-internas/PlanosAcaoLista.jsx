"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Plus, Loader2, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { numPA, STATUS_PLANO } from "@/lib/plano-acao";

// Lista de planos de ação 5W2H — usada como aba dentro de Auditorias Internas.
export default function PlanosAcaoLista() {
  const router = useRouter();
  const [planos, setPlanos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch("/api/qualidade/planos-acao").then((r) => (r.ok ? r.json() : null)).then((j) => setPlanos(j?.planos || [])).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-torg-gray">Ações no formato 5W2H (o quê, por quê, onde, quem, quando, como, quanto) com acompanhamento e status por ação.</p>
        <button onClick={() => setModal(true)} className="px-3.5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-dark text-sm font-medium flex items-center gap-1.5"><Plus size={16} /> Novo plano</button>
      </div>

      {loading ? (
        <div className="py-14 text-center text-torg-gray"><Loader2 size={24} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-10 text-center text-red-600 text-sm">{erro}</div>
      ) : planos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <ListChecks size={38} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nenhum plano de ação ainda. Crie o primeiro.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {planos.map((p) => {
            const pct = p.total ? Math.round((p.concluidos / p.total) * 100) : 0;
            return (
              <button key={p.id} onClick={() => router.push(`/qualidade/planos-acao/${p.id}`)} className="text-left bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-torg-blue-200 hover:shadow transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-torg-blue text-sm">{numPA(p.numero)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_PLANO[p.status]?.cor}`}>{STATUS_PLANO[p.status]?.label || p.status}</span>
                    </div>
                    <p className="text-sm font-semibold text-torg-dark mt-1 truncate">{p.titulo}</p>
                    <p className="text-[11px] text-torg-gray mt-0.5 truncate">{p.origem ? `Origem: ${p.origem}` : "—"}{p.responsavel ? ` · ${p.responsavel}` : ""}</p>
                  </div>
                  {p.atrasados > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 whitespace-nowrap">{p.atrasados} atrasada{p.atrasados > 1 ? "s" : ""}</span>}
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] text-torg-gray mb-1"><span>{p.concluidos}/{p.total} ações concluídas</span><span>{pct}%</span></div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {modal && <ModalNovoPlano onClose={() => setModal(false)} onCriado={(id) => router.push(`/qualidade/planos-acao/${id}`)} />}
    </div>
  );
}

function ModalNovoPlano({ onClose, onCriado }) {
  const [f, setF] = useState({ titulo: "", origem: "", responsavel: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!f.titulo.trim()) return setErro("Informe o título do plano.");
    setErro(""); setSalvando(true);
    try {
      const r = await fetch("/api/qualidade/planos-acao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao criar");
      onCriado(j.id);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark">Novo plano de ação</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Título *</label>
            <input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Tratamento das NCs da auditoria da Engenharia" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Origem</label>
            <input value={f.origem} onChange={(e) => set("origem", e.target.value)} placeholder="De onde veio (Auditoria RAI-001, NC, reclamação, reunião…)" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Responsável pelo plano</label>
            <input value={f.responsavel} onChange={(e) => set("responsavel", e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Criar</button>
        </div>
      </div>
    </div>
  );
}
