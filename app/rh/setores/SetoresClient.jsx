"use client";
import { useState, useEffect, useRef } from "react";
import {
  Building2, PlusCircle, Loader2, AlertCircle, X, Users,
  Download, Upload, FileSpreadsheet, CheckCircle2, XCircle,
} from "lucide-react";

export default function SetoresClient() {
  const [setores, setSetores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: "", sigla: "", cor: "#006EAB" });

  // Import Excel
  const fileRef = useRef(null);
  const [importando, setImportando] = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const carregar = () => {
    setCarregando(true);
    fetch("/api/rh/setores").then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error); setSetores(d.data || []); })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregar(); }, []);

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

  // Baixar modelo Excel
  const baixarModelo = async () => {
    try {
      const res = await fetch("/api/rh/setores/template");
      if (!res.ok) throw new Error("Erro ao gerar modelo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modelo-setores-torg.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e.message);
    }
  };

  // Importar planilha
  const importarPlanilha = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fileRef.current.value = "";

    setImportando(true);
    setErro("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/rh/setores/importar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok && !data.detalhes) throw new Error(data.error || "Erro na importação");
      setImportResult(data);
      setModalImport(true);
      if (data.criados > 0) carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setImportando(false);
    }
  };

  if (carregando) {
    return <div className="flex items-center justify-center py-20 text-torg-gray"><Loader2 size={20} className="animate-spin mr-2" /> Carregando setores…</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Setores</h2>
          <p className="text-sm text-torg-gray mt-1">Departamentos da empresa</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={baixarModelo}
            className="px-3 py-2 text-sm text-torg-blue border border-torg-blue/30 rounded-lg hover:bg-torg-blue/5 inline-flex items-center gap-2 font-medium">
            <Download size={15} /> Baixar modelo
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importando}
            className="px-3 py-2 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 inline-flex items-center gap-2 font-medium disabled:opacity-50">
            {importando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {importando ? "Importando…" : "Importar planilha"}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={importarPlanilha} className="hidden" />
          <button onClick={() => setModal(true)}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2">
            <PlusCircle size={16} /> Novo Setor
          </button>
        </div>
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

      {/* Modal Novo Setor */}
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

      {/* Modal Resultado Importação */}
      {modalImport && importResult && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModalImport(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={20} className="text-torg-blue" />
                <h3 className="text-lg font-bold text-torg-dark">Resultado da importação</h3>
              </div>
              <button onClick={() => setModalImport(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-torg-dark">{importResult.total}</p>
                  <p className="text-[10px] text-torg-gray uppercase tracking-wider mt-1">Total linhas</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-emerald-700">{importResult.criados}</p>
                  <p className="text-[10px] text-emerald-600 uppercase tracking-wider mt-1">Criados</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${importResult.erros > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                  <p className={`text-2xl font-extrabold ${importResult.erros > 0 ? "text-red-600" : "text-torg-gray"}`}>{importResult.erros}</p>
                  <p className={`text-[10px] uppercase tracking-wider mt-1 ${importResult.erros > 0 ? "text-red-500" : "text-torg-gray"}`}>Erros</p>
                </div>
              </div>
              {importResult.detalhes?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-torg-gray uppercase tracking-wider mb-2">Detalhes por linha</p>
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50/60 border-b border-gray-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Linha</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Nome</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {importResult.detalhes.map((d, i) => (
                          <tr key={i} className={d.ok ? "" : "bg-red-50/50"}>
                            <td className="px-3 py-1.5 text-torg-gray tabular-nums">{d.linha}</td>
                            <td className="px-3 py-1.5 text-torg-dark font-medium truncate max-w-[180px]">{d.nome || "—"}</td>
                            <td className="px-3 py-1.5">
                              {d.ok ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} /> Criado</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={12} /> {d.erro}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end shrink-0">
              <button onClick={() => setModalImport(false)}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
