"use client";
import { useState, useEffect } from "react";
import { Briefcase, PlusCircle, Loader2, AlertCircle, X, Users, ChevronDown } from "lucide-react";

const NIVEIS = [
  { value: "OPERACIONAL", label: "Operacional", cor: "bg-gray-100 text-gray-700" },
  { value: "TECNICO", label: "Técnico", cor: "bg-blue-100 text-blue-800" },
  { value: "SUPERVISAO", label: "Supervisão", cor: "bg-purple-100 text-purple-800" },
  { value: "GERENCIA", label: "Gerência", cor: "bg-amber-100 text-amber-800" },
  { value: "DIRETORIA", label: "Diretoria", cor: "bg-rose-100 text-rose-800" },
];
const nivelMap = Object.fromEntries(NIVEIS.map((n) => [n.value, n]));

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

export default function CargosClient() {
  const [cargos, setCargos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: "", nivel: "OPERACIONAL", categoria: "", salarioBase: "", cbo: "" });

  useEffect(() => {
    fetch("/api/rh/cargos").then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error); setCargos(d.data || []); })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      const body = {
        ...form,
        salarioBase: form.salarioBase ? Number(form.salarioBase) : null,
        categoria: form.categoria || null,
        cbo: form.cbo || null,
        nivel: form.nivel || null,
      };
      const res = await fetch("/api/rh/cargos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCargos((prev) => [...prev, { ...data.data, _count: { funcionarios: 0 } }]);
      setModal(false);
      setForm({ nome: "", nivel: "OPERACIONAL", categoria: "", salarioBase: "", cbo: "" });
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <div className="flex items-center justify-center py-20 text-torg-gray"><Loader2 size={20} className="animate-spin mr-2" /> Carregando cargos…</div>;
  }

  // Agrupar por nível
  const porNivel = {};
  for (const c of cargos) {
    const n = c.nivel || "SEM_NIVEL";
    if (!porNivel[n]) porNivel[n] = [];
    porNivel[n].push(c);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Cargos</h2>
          <p className="text-sm text-torg-gray mt-1">Funções e níveis hierárquicos</p>
        </div>
        <button onClick={() => setModal(true)}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2">
          <PlusCircle size={16} /> Novo Cargo
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5" /> {erro}
        </div>
      )}

      {cargos.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Briefcase size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">Nenhum cargo cadastrado</p>
          <p className="text-xs text-torg-gray mt-2">Crie os cargos da empresa para poder cadastrar funcionários.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {NIVEIS.map(({ value, label, cor }) => {
            const lista = porNivel[value];
            if (!lista?.length) return null;
            return (
              <div key={value}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${cor}`}>{label}</span>
                  <span className="text-xs text-torg-gray">{lista.length} cargo{lista.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/60 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Cargo</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">CBO</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Salário base</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Funcionários</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lista.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-torg-dark">{c.nome}</td>
                          <td className="px-4 py-2.5 text-torg-gray text-xs">{c.categoria || "—"}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-torg-gray">{c.cbo || "—"}</td>
                          <td className="px-4 py-2.5 text-right text-torg-dark tabular-nums">{fmtMoeda(c.salarioBase)}</td>
                          <td className="px-4 py-2.5 text-right text-torg-gray">{c._count?.funcionarios || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !salvando && setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">Novo Cargo</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Nome do cargo *</label>
                <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Soldador, Engenheiro, Analista RH…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Nível</label>
                  <div className="relative">
                    <select value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value })}
                      className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                      {NIVEIS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Categoria</label>
                  <input type="text" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    placeholder="Produção, Adm…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Salário base (R$)</label>
                  <input type="number" value={form.salarioBase} onChange={(e) => setForm({ ...form, salarioBase: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">CBO</label>
                  <input type="text" value={form.cbo} onChange={(e) => setForm({ ...form, cbo: e.target.value })}
                    placeholder="7242-05"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={salvar} disabled={salvando || !form.nome}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                {salvando ? "Salvando…" : "Criar Cargo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
