"use client";
import { useState, useEffect } from "react";
import { Building2, PlusCircle, Loader2, AlertCircle, X, Users } from "lucide-react";

export default function SetoresClient() {
  const [setores, setSetores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: "", sigla: "", cor: "#006EAB" });

  useEffect(() => {
    fetch("/api/rh/setores").then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error); setSetores(d.data || []); })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/rh/setores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sigla: form.sigla || null, cor: form.cor || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSetores((prev) => [...prev, { ...data.data, _count: { funcionarios: 0 } }]);
      setModal(false);
      setForm({ nome: "", sigla: "", cor: "#006EAB" });
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <div className="flex items-center justify-center py-20 text-torg-gray"><Loader2 size={20} className="animate-spin mr-2" /> Carregando setores…</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Setores</h2>
          <p className="text-sm text-torg-gray mt-1">Departamentos da empresa</p>
        </div>
        <button onClick={() => setModal(true)}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2">
          <PlusCircle size={16} /> Novo Setor
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5" /> {erro}
        </div>
      )}

      {setores.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">Nenhum setor cadastrado</p>
          <p className="text-xs text-torg-gray mt-2">Crie os setores da empresa para poder cadastrar funcionários.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {setores.map((s) => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: s.cor || "#006EAB" }}>
                  {s.sigla || s.nome.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-torg-dark">{s.nome}</h3>
                  {s.sigla && <p className="text-[10px] text-torg-gray">{s.sigla}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1 text-torg-gray">
                  <Users size={14} /> {s._count?.funcionarios || 0} funcionário{(s._count?.funcionarios || 0) !== 1 ? "s" : ""}
                </span>
                {s.gestor && <span className="text-xs text-torg-blue font-medium">{s.gestor.nome}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !salvando && setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">Novo Setor</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Nome do setor *</label>
                <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Produção, Administrativo, Engenharia…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Sigla</label>
                  <input type="text" value={form.sigla} onChange={(e) => setForm({ ...form, sigla: e.target.value })}
                    placeholder="PROD" maxLength={6}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Cor</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })}
                      className="w-10 h-10 rounded border border-gray-200 cursor-pointer" />
                    <span className="text-xs text-torg-gray">{form.cor}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={salvar} disabled={salvando || !form.nome}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                {salvando ? "Salvando…" : "Criar Setor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
