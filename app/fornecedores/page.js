"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/utils";
import { PlusCircle, Trash2, Pencil, X } from "lucide-react";

const CATEGORIAS = ["Material", "Consumível", "Tintas", "Parafusos", "Acessórios", "EPI", "Ferramentas", "Elétrica", "Hidráulica"];

export default function Fornecedores() {
  const { fornecedores, setFornecedores, showToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ nome: "", cnpj: "", email: "", telefone: "", contato: "", endereco: "", observacoes: "", categorias: [] });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleCat = (cat) => {
    set("categorias", form.categorias.includes(cat) ? form.categorias.filter((c) => c !== cat) : [...form.categorias, cat]);
  };

  const editar = (f) => {
    setEditingId(f.id);
    setForm({ nome: f.nome || "", cnpj: f.cnpj || "", email: f.email || "", telefone: f.telefone || "", contato: f.contato || "", endereco: f.endereco || "", observacoes: f.observacoes || "", categorias: f.categorias || [] });
    setShowForm(true);
  };

  const salvar = () => {
    if (!form.nome.trim()) return showToast("Preencha o nome do fornecedor", "error");
    if (editingId) {
      setFornecedores((prev) => prev.map((f) => f.id === editingId ? { ...f, ...form } : f));
    } else {
      setFornecedores((prev) => [...prev, { ...form, id: uid() }]);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ nome: "", cnpj: "", email: "", telefone: "", contato: "", endereco: "", observacoes: "", categorias: [] });
    showToast(editingId ? "Fornecedor atualizado!" : "Fornecedor cadastrado!");
  };

  const remover = (id) => {
    setFornecedores((prev) => prev.filter((f) => f.id !== id));
    showToast("Fornecedor removido");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Fornecedores</h2>
        <button
          onClick={() => { if (showForm) { setShowForm(false); setEditingId(null); setForm({ nome: "", cnpj: "", email: "", telefone: "", contato: "", endereco: "", observacoes: "", categorias: [] }); } else { setShowForm(true); } }}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
        >
          <PlusCircle size={18} /> Novo Fornecedor
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome / Razão Social</label>
              <input type="text" value={form.nome} onChange={(e) => set("nome", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
              <input type="text" value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0001-00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input type="text" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(00) 00000-0000" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>
          <div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contato</label>
              <input type="text" value={form.contato} onChange={(e) => set("contato", e.target.value)} placeholder="Nome do contato" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Endereço</label>
              <input type="text" value={form.endereco} onChange={(e) => set("endereco", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
            <textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Categorias</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIAS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    form.categorias.includes(cat)
                      ? "bg-blue-100 border-blue-300 text-blue-700"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowForm(false); setEditingId(null); setForm({ nome: "", cnpj: "", email: "", telefone: "", contato: "", endereco: "", observacoes: "", categorias: [] }); }} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancelar</button>
            <button onClick={salvar} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">{editingId ? "Atualizar" : "Salvar"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {fornecedores.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p>Nenhum fornecedor cadastrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CNPJ</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-mail</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telefone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categorias</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fornecedores.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-800">{f.nome}</td>
                    <td className="px-6 py-3 text-gray-600 font-mono text-xs">{f.cnpj || "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{f.email || "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{f.telefone || "—"}</td>
                    <td className="px-6 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(f.categorias || []).map((c) => (
                          <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                    <button onClick={() => editar(f)} className="text-blue-500 hover:text-blue-700 mr-2"><Pencil size={16} /></button>
                    <button onClick={() => remover(f.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
