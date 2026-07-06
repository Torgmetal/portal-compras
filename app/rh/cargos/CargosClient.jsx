"use client";
import { useState, useEffect, useRef } from "react";
import {
  Briefcase, PlusCircle, Loader2, AlertCircle, X, Users, ChevronDown,
  Download, Upload, FileSpreadsheet, CheckCircle2, XCircle,
} from "lucide-react";

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

  // Import Excel
  const fileRef = useRef(null);
  const [importando, setImportando] = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const carregar = () => {
    setCarregando(true);
    fetch("/api/rh/cargos").then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error); setCargos(d.data || []); })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregar(); }, []);

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

  // Baixar modelo Excel
  const baixarModelo = async () => {
    try {
      const res = await fetch("/api/rh/cargos/template");
      if (!res.ok) throw new Error("Erro ao gerar modelo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modelo-cargos-torg.xlsx";
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
      const res = await fetch("/api/rh/cargos/importar", { method: "POST", body: fd });
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
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Cargos</h2>
          <p className="text-sm text-torg-gray mt-1">Funções e níveis hierárquicos</p>
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
            <PlusCircle size={16} /> Novo Cargo
          </button>
        </div>
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

      {/* Modal Novo Cargo */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
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
