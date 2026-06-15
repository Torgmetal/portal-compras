"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, AlertCircle, RefreshCw, Plus, BookCheck, ChevronRight, X, Check, Weight,
} from "lucide-react";

const fmtKg = (v) => (!v ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");

export default function DataBooksClient() {
  const router = useRouter();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const res = await fetch("/api/qualidade/data-books");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar");
      setBooks(json.data || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2">
            <BookCheck size={20} className="text-torg-blue" /> Data Books
          </h1>
          <p className="text-xs text-torg-gray mt-0.5">Dossiês de qualidade por OP — 20 seções amarradas à norma (NBR 16775).</p>
        </div>
        <button onClick={() => setModal(true)} className="text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-4 py-2 rounded-lg inline-flex items-center gap-2 shrink-0">
          <Plus size={15} /> Novo data book
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-torg-gray"><Loader2 size={26} className="animate-spin mb-3" /><p className="text-sm">Carregando…</p></div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-16 text-center"><AlertCircle size={26} className="text-red-500 mb-3" /><p className="text-sm text-torg-dark mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>
      ) : books.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-torg-gray">
          <BookCheck size={32} className="mb-3 opacity-40" />
          <p className="text-sm font-medium text-torg-dark">Nenhum data book ainda</p>
          <p className="text-xs mt-1">Crie um para uma OP e monte as 20 seções.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {books.map((b) => (
            <Link key={b.id} href={`/qualidade/data-books/${b.id}`} className="block bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-bold text-torg-blue font-mono whitespace-nowrap">{fmtOP(b.opNumero)}</span>
                  <span className="text-sm text-torg-dark font-medium truncate">{b.cliente || "—"}</span>
                  {b.obra && <span className="text-xs text-torg-gray whitespace-nowrap shrink-0">({b.obra})</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-torg-gray inline-flex items-center gap-1"><Weight size={12} /> {fmtKg(b.pesoTotalKg)}</span>
                  {b.status === "EMITIDO" ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700">Emitido</span>
                  ) : (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${b.pendentes === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {b.progresso}% · {b.pendentes} pendente(s)
                    </span>
                  )}
                  <ChevronRight size={16} className="text-torg-gray" />
                </div>
              </div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-torg-blue rounded-full transition-all" style={{ width: `${b.progresso}%` }} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {modal && <ModalNovo onClose={() => setModal(false)} onCreated={(id) => router.push(`/qualidade/data-books/${id}`)} />}
    </div>
  );
}

function ModalNovo({ onClose, onCreated }) {
  const [op, setOp] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar() {
    setErro("");
    if (!op.trim()) { setErro("Informe a OP."); return; }
    setSalvando(true);
    try {
      const res = await fetch("/api/qualidade/data-books", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: op.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro ao criar");
      onCreated(json.id);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-bold text-torg-dark flex items-center gap-1.5"><BookCheck size={15} className="text-torg-blue" /> Novo data book</p>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="px-4 py-4">
          <label className="block">
            <span className="text-[10px] font-medium text-torg-gray uppercase">OP (número)</span>
            <input value={op} onChange={(e) => setOp(e.target.value)} placeholder="ex.: 083" autoFocus
              onKeyDown={(e) => e.key === "Enter" && criar()}
              className="mt-1 w-full px-2 py-1.5 text-[13px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue-300" />
          </label>
          <p className="text-[11px] text-torg-gray mt-2">Puxa cliente, obra, peso e nº de peças da OP e cria as 20 seções.</p>
          {erro && <p className="text-[11px] text-red-600 flex items-center gap-1 mt-2"><AlertCircle size={12} /> {erro}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={salvando} className="px-3 py-1.5 text-[12px] text-torg-gray hover:text-torg-dark rounded-lg hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
          <button onClick={criar} disabled={salvando} className="px-3 py-1.5 text-[12px] font-semibold text-white bg-torg-blue rounded-lg hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">
            {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Criar
          </button>
        </div>
      </div>
    </div>
  );
}
