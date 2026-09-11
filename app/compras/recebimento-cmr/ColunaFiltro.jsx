"use client";
import { useState } from "react";
import { Search, ArrowUp, ArrowDown } from "lucide-react";

// ⚠ Em arquivo próprio: é UI genérica de tabela (ordenar, pesquisar, marcar valores) e não sabe
// nada de CMR. Ficava no meio do cliente do lançamento só por ter nascido lá.
// Popup de filtro de coluna (estilo Excel): ordenar, pesquisar, marcar/desmarcar valores.
export default function ColunaFiltro({ col, rect, valores, selecionados, ordenar, onOrdenar, onAplicar, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set(selecionados || valores)); // undefined = todos
  const filtrados = valores.filter((v) => v.toLowerCase().includes(q.toLowerCase()));
  const todosMarcados = filtrados.every((v) => sel.has(v));
  const toggle = (v) => setSel((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const marcarTodos = () => setSel((s) => { const n = new Set(s); if (todosMarcados) filtrados.forEach((v) => n.delete(v)); else filtrados.forEach((v) => n.add(v)); return n; });
  function aplicar() {
    // se selecionou tudo → sem filtro (undefined); senão manda o set
    onAplicar(sel.size === valores.length ? null : new Set(sel));
  }
  const left = Math.max(8, Math.min(rect.left, (typeof window !== "undefined" ? window.innerWidth : 1200) - 300));
  const top = rect.bottom + 4;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-xl text-[12px]" style={{ left, top }}>
        <div className="p-2 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-torg-gray uppercase px-1 pb-1">{col.label}</p>
          <button onClick={() => onOrdenar(ordenar === "asc" ? null : "asc")} className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 inline-flex items-center gap-2 ${ordenar === "asc" ? "text-torg-blue" : ""}`}><ArrowUp size={13} /> Ordenar A→Z (menor→maior)</button>
          <button onClick={() => onOrdenar(ordenar === "desc" ? null : "desc")} className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 inline-flex items-center gap-2 ${ordenar === "desc" ? "text-torg-blue" : ""}`}><ArrowDown size={13} /> Ordenar Z→A (maior→menor)</button>
        </div>
        <div className="p-2">
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Pesquisar…" className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs" />
          </div>
          <label className="flex items-center gap-2 px-1 py-1 font-medium cursor-pointer">
            <input type="checkbox" checked={todosMarcados} onChange={marcarTodos} /> (Selecionar tudo)
          </label>
          <div className="max-h-56 overflow-y-auto border-t border-gray-100 mt-1 pt-1">
            {filtrados.length === 0 ? <p className="px-1 py-2 text-torg-gray">Nada encontrado.</p>
              : filtrados.map((v) => (
                <label key={v} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-gray-50 rounded">
                  <input type="checkbox" checked={sel.has(v)} onChange={() => toggle(v)} />
                  <span className="truncate" title={v}>{v}</span>
                </label>
              ))}
          </div>
        </div>
        <div className="p-2 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={aplicar} className="px-3 py-1.5 bg-torg-blue text-white rounded-lg hover:bg-torg-dark">OK</button>
        </div>
      </div>
    </>
  );
}
