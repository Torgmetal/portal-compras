"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileBarChart2, Plus, Loader2, AlertCircle, RefreshCw, Inbox, FileDown, Trash2, X, Camera,
} from "lucide-react";
import { useStore } from "@/lib/store";

const fmt = (d) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtOP = (n) => { if (!n) return null; const s = String(n).trim(); return /^\d+$/.test(s) ? `OP-${s.padStart(3, "0")}` : `OP ${s}`; };
const ST = { RASCUNHO: "bg-amber-100 text-amber-700", EMITIDO: "bg-green-100 text-green-700" };

export default function RelatoriosClient() {
  const { showToast } = useStore();
  const router = useRouter();
  const [relatorios, setRelatorios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [novo, setNovo] = useState(false);
  const [ops, setOps] = useState([]);
  const [buscaOp, setBuscaOp] = useState("");
  const [titulo, setTitulo] = useState("");
  const [opSel, setOpSel] = useState(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/relatorios");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setRelatorios(d.relatorios || []);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = async () => {
    setNovo(true); setTitulo(""); setOpSel(null); setBuscaOp("");
    if (!ops.length) {
      try { const r = await fetch("/api/relatorios/ops"); const d = await r.json(); if (r.ok) setOps(d.ops || []); } catch {}
    }
  };

  const criar = async () => {
    if (titulo.trim().length < 2) { showToast("Dê um título ao relatório", "error"); return; }
    setCriando(true);
    try {
      const body = { titulo, opId: opSel?.id || null, opNumero: opSel?.numero || null, cliente: opSel?.cliente || null, obra: opSel?.obra || null };
      const r = await fetch("/api/relatorios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao criar");
      router.push(`/relatorios/${d.id}`);
    } catch (e) { showToast(e.message, "error"); setCriando(false); }
  };

  const excluir = async (id) => {
    if (!confirm("Excluir este relatório?")) return;
    try {
      const r = await fetch(`/api/relatorios/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha");
      setRelatorios((p) => p.filter((x) => x.id !== id));
      showToast("Relatório excluído", "success");
    } catch (e) { showToast(e.message, "error"); }
  };

  const opsFiltradas = ops.filter((o) => {
    const q = buscaOp.trim().toLowerCase();
    if (!q) return true;
    return [o.numero, o.cliente, o.obra].filter(Boolean).some((s) => s.toLowerCase().includes(q));
  }).slice(0, 40);

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <FileBarChart2 className="text-torg-blue" /> Relatórios
          </h2>
          <p className="text-sm text-torg-gray mt-1">Gere relatórios de status com fotos para apresentar ao cliente, no layout padrão Torg.</p>
        </div>
        <button onClick={abrirNovo} className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2">
          <Plus size={16} /> Novo relatório de status
        </button>
      </div>

      {carregando ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
      ) : erro ? (
        <div className="py-16 text-center">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : relatorios.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <FileBarChart2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-torg-gray">Nenhum relatório ainda.</p>
          <p className="text-sm text-torg-gray mt-1">Clique em “Novo relatório de status” para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {relatorios.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/relatorios/${r.id}`} className="font-semibold text-torg-dark hover:text-torg-blue leading-tight">{r.titulo}</Link>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${ST[r.status] || "bg-gray-100 text-gray-600"}`}>{r.status}</span>
              </div>
              <div className="text-xs text-torg-gray mt-1">
                {[r.cliente, r.obra, fmtOP(r.opNumero)].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="text-[11px] text-torg-gray mt-2 flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><Camera size={12} /> {r.nFotos} foto{r.nFotos === 1 ? "" : "s"}</span>
                <span>{r.nBlocos} bloco{r.nBlocos === 1 ? "" : "s"}</span>
                <span>· {fmt(r.createdAt)}{r.criadoPorNome ? ` · ${r.criadoPorNome}` : ""}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                <Link href={`/relatorios/${r.id}`} className="text-xs text-torg-blue border border-torg-blue-200 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 font-medium">Abrir</Link>
                <a href={`/api/relatorios/${r.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs text-torg-dark border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 inline-flex items-center gap-1.5"><FileDown size={13} /> PDF</a>
                <button onClick={() => excluir(r.id)} className="text-xs text-red-500 hover:text-red-700 ml-auto inline-flex items-center gap-1"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {novo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !criando && setNovo(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-torg-dark">Novo relatório de status</h3>
              <button onClick={() => setNovo(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <label className="text-xs text-torg-gray">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus placeholder="Ex.: Status de fabricação — Julho/2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 mt-1 focus:ring-2 focus:ring-torg-blue" />
            <label className="text-xs text-torg-gray">Vincular a uma OP <span className="text-gray-400">(opcional — preenche cliente/obra)</span></label>
            {opSel ? (
              <div className="flex items-center justify-between border border-torg-blue-200 bg-torg-blue-50/40 rounded-lg px-3 py-2 mt-1 text-sm">
                <span className="text-torg-dark">{fmtOP(opSel.numero)} · {opSel.cliente}{opSel.obra ? " · " + opSel.obra : ""}</span>
                <button onClick={() => setOpSel(null)} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
              </div>
            ) : (
              <>
                <input value={buscaOp} onChange={(e) => setBuscaOp(e.target.value)} placeholder="Buscar OP por número, cliente ou obra…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />
                {buscaOp.trim() && (
                  <div className="border border-gray-100 rounded-lg mt-1 max-h-48 overflow-y-auto divide-y divide-gray-50">
                    {opsFiltradas.length === 0 ? <div className="px-3 py-2 text-xs text-torg-gray">Nenhuma OP encontrada</div> :
                      opsFiltradas.map((o) => (
                        <button key={o.id} onClick={() => { setOpSel(o); if (!titulo.trim()) setTitulo(`Status — ${o.obra || o.cliente}`); }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">
                          <span className="font-medium text-torg-dark">{fmtOP(o.numero)}</span> · {o.cliente}{o.obra ? " · " + o.obra : ""}
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setNovo(false)} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">Cancelar</button>
              <button onClick={criar} disabled={criando || titulo.trim().length < 2}
                className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50">
                {criando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Criar e montar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
