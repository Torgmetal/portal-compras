"use client";
// Escolha do funcionário do RH para vincular a uma conta do portal. Com o vínculo a pessoa entra pelo
// CPF e o e-mail deixa de ser obrigatório. Vitor (14/09/2026): "criar um usuário para um funcionário, mas sem e-mail".
import { useEffect, useMemo, useState } from "react";
import { Search, X, UserCheck } from "lucide-react";

const fmtCpf = (c) => String(c || "").replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

/**
 * @param {{ value: string|null, nome?: string, onChange: (f: {id:string,nome:string,cpf:string}|null)=>void, disabled?: boolean }} props
 */
export default function SeletorFuncionario({ value, nome, onChange, disabled }) {
  const [lista, setLista] = useState(null), [busca, setBusca] = useState(""), [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto || lista) return;
    fetch("/api/rh/funcionarios?ativo=true").then((r) => (r.ok ? r.json() : { funcionarios: [] })).then((j) => setLista((j.funcionarios || j.data || []).map((f) => ({ id: f.id, nome: f.nome, cpf: f.cpf || "", temUsuario: !!f.usuario })))).catch(() => setLista([]));
  }, [aberto, lista]);
  const filtrados = useMemo(() => { const q = busca.trim().toLowerCase(); return (lista || []).filter((f) => !q || f.nome.toLowerCase().includes(q) || f.cpf.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "§")).slice(0, 40); }, [lista, busca]);
  if (value) {
    return (
      <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2 text-sm">
        <UserCheck size={15} className="text-emerald-700 shrink-0" />
        <span className="text-torg-dark truncate">{nome || "Funcionário vinculado"}</span>
        <span className="ml-auto text-[11px] text-emerald-800 whitespace-nowrap">entra pelo CPF</span>
        {!disabled && <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-red-600" title="Desvincular"><X size={14} /></button>}
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busca} disabled={disabled} onChange={(e) => { setBusca(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)}
          placeholder="Buscar funcionário por nome ou CPF (opcional)" className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30 disabled:bg-gray-50" />
      </div>
      {aberto && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {lista === null ? <p className="px-3 py-2 text-xs text-torg-gray">Carregando…</p>
            : filtrados.length === 0 ? <p className="px-3 py-2 text-xs text-torg-gray">Nenhum funcionário ativo encontrado.</p>
            : filtrados.map((f) => (
              <button type="button" key={f.id} disabled={f.temUsuario} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(f); setBusca(""); setAberto(false); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-torg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2">
                <span className="text-torg-dark truncate">{f.nome}</span>
                <span className="text-[11px] text-torg-gray whitespace-nowrap">{f.cpf ? fmtCpf(f.cpf) : "sem CPF"}{f.temUsuario ? " · já tem acesso" : ""}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
