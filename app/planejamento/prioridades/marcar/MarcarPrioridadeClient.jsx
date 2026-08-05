"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Flag, Search, Loader2, ArrowLeft, AlertCircle } from "lucide-react";

const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR")} kg`;
// Fase da obra a partir da marca (T83A1 → "A").
const faseDaMarca = (m) => (String(m || "").toUpperCase().match(/^T?\d+([A-Z]+)/) || [])[1] || "";

export default function MarcarPrioridadeClient() {
  const [obras, setObras] = useState([]);
  const [opId, setOpId] = useState("");
  const [pecas, setPecas] = useState([]);
  const [busca, setBusca] = useState("");
  const [filtroFase, setFiltroFase] = useState("");
  const [loadingObras, setLoadingObras] = useState(true);
  const [loadingPecas, setLoadingPecas] = useState(false);
  const [erro, setErro] = useState("");
  const [salvandoId, setSalvandoId] = useState(null);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/planejamento/prioridade-pecas", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Erro ao carregar OPs");
        setObras(j.obras || []);
      } catch (e) { setErro(e.message); } finally { setLoadingObras(false); }
    })();
  }, []);

  const carregarPecas = useCallback(async (id) => {
    if (!id) { setPecas([]); return; }
    setLoadingPecas(true); setErro(""); setAviso("");
    try {
      const res = await fetch(`/api/planejamento/prioridade-pecas?opId=${id}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar peças");
      setPecas(j.pecas || []);
    } catch (e) { setErro(e.message); } finally { setLoadingPecas(false); }
  }, []);

  useEffect(() => { carregarPecas(opId); }, [opId, carregarPecas]);

  const toggle = async (peca) => {
    const marcar = peca.prioridade == null;
    setSalvandoId(peca.id); setAviso("");
    try {
      const res = await fetch("/api/planejamento/prioridade-pecas", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pecaId: peca.id, marcar }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao salvar");
      if (j.jaMarcada) setAviso(`${peca.marca} já estava marcada como prioridade.`);
      setPecas((prev) => prev.map((p) => (p.id === peca.id ? { ...p, prioridade: j.peca.prioridade } : p)));
      setObras((prev) => prev.map((o) => (o.opId === opId ? { ...o, nMarcadas: Math.max(0, (o.nMarcadas || 0) + (marcar ? 1 : -1)) } : o)));
    } catch (e) { setAviso(e.message); } finally { setSalvandoId(null); }
  };

  const fases = [...new Set(pecas.map((p) => faseDaMarca(p.marca)).filter(Boolean))].sort();
  const filtradas = pecas.filter((p) => (!filtroFase || faseDaMarca(p.marca) === filtroFase) && (!busca || p.marca.toLowerCase().includes(busca.toLowerCase())));
  const nMarcadas = pecas.filter((p) => p.prioridade != null).length;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/planejamento/prioridades" className="p-2 rounded-lg hover:bg-gray-100 text-torg-gray"><ArrowLeft size={18} /></Link>
        <h1 className="text-2xl font-bold text-torg-dark">Marcar prioridades</h1>
      </div>
      <p className="text-sm text-torg-gray mb-5 ml-11">A peça marcada fica prioritária na obra toda e aparece em destaque na TV de Prioridades por setor.</p>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <label className="block text-xs font-medium text-torg-gray mb-1.5">OP</label>
        {loadingObras ? (
          <div className="text-sm text-torg-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando OPs…</div>
        ) : (
          <select value={opId} onChange={(e) => setOpId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Selecione uma OP…</option>
            {obras.map((o) => (
              <option key={o.opId} value={o.opId}>OP-{o.opNumero} — {o.obra}{o.nMarcadas ? ` (${o.nMarcadas} prioritárias)` : ""}</option>
            ))}
          </select>
        )}
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3 flex items-center gap-2"><AlertCircle size={14} /> {erro}</div>}
      {aviso && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 mb-3">{aviso}</div>}

      {opId && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative max-w-xs flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca…" className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm" />
              </div>
              {fases.length > 1 && (
                <select value={filtroFase} onChange={(e) => setFiltroFase(e.target.value)} className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white" title="Fase da obra">
                  <option value="">Todas as fases</option>
                  {fases.map((f) => <option key={f} value={f}>Fase {f}</option>)}
                </select>
              )}
            </div>
            <div className="text-sm text-torg-gray"><b className="text-torg-dark">{nMarcadas}</b> prioritárias · {pecas.length} peças</div>
          </div>
          {loadingPecas ? (
            <div className="p-10 text-center text-torg-gray"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> carregando peças…</div>
          ) : filtradas.length === 0 ? (
            <div className="p-10 text-center text-torg-gray text-sm">nenhuma peça{busca ? " com esse filtro" : ""}.</div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
              {filtradas.map((p) => {
                const marcada = p.prioridade != null;
                return (
                  <li key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${marcada ? "bg-amber-50/60" : ""}`}>
                    <button onClick={() => toggle(p)} disabled={salvandoId === p.id} title={marcada ? "Desmarcar prioridade" : "Marcar como prioridade"}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${marcada ? "bg-amber-400 text-white hover:bg-amber-500" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}>
                      {salvandoId === p.id ? <Loader2 size={15} className="animate-spin" /> : <Flag size={15} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-torg-dark text-sm flex items-center gap-2">
                        {p.marca}
                        {marcada && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">#{p.prioridade}</span>}
                      </div>
                      <div className="text-xs text-torg-gray">{p.tipoPeca === "CONJUNTO" ? "conjunto" : "avulsa"} · {fmtKg(p.pesoTotalKg)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
