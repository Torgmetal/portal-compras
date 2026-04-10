"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

const UNIDADES = ["UN", "KG", "LT", "M", "M²", "CX", "PC", "GL", "TB", "RL", "PAR", "JG", "SC"];

export default function NovaRm() {
  const { rms, setRms, showToast } = useStore();
  const router = useRouter();

  const [form, setForm] = useState({
    tipo: "Material",
    descricao: "",
    observacao: "",
    solicitante: "",
    centroCusto: "",
    itens: [{ descricao: "", qtd: 1, unidade: "UN" }],
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i, k, v) => {
    const itens = [...form.itens];
    itens[i] = { ...itens[i], [k]: v };
    set("itens", itens);
  };
  const addItem = () => set("itens", [...form.itens, { descricao: "", qtd: 1, unidade: "UN" }]);
  const removeItem = (i) => set("itens", form.itens.filter((_, idx) => idx !== i));

  const salvar = () => {
    if (!form.descricao.trim()) return showToast("Preencha a descrição da RM", "error");
    if (form.itens.some((it) => !it.descricao.trim())) return showToast("Preencha todos os itens", "error");

    const novaRm = {
      id: uid(),
      numero: String(rms.length + 1).padStart(4, "0"),
      tipo: form.tipo,
      descricao: form.descricao,
      observacao: form.observacao,
      solicitante: form.solicitante,
      centroCusto: form.centroCusto,
      itens: form.itens.map((it) => ({ ...it, id: uid() })),
      data: today(),
      status: "Aberta",
      cotacoes: [],
      mapaGerado: false,
    };

    setRms((prev) => [novaRm, ...prev]);
    showToast("RM criada com sucesso!");
    router.push(`/rm/${novaRm.id}`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Nova Requisição de Material</h2>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={form.tipo}
              onChange={(e) => set("tipo", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option>Material</option>
              <option>Consumível</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
            <input
              type="text"
              value={today()}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante</label>
            <input
              type="text"
              value={form.solicitante}
              onChange={(e) => set("solicitante", e.target.value)}
              placeholder="Nome do solicitante"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo</label>
            <input
              type="text"
              value={form.centroCusto}
              onChange={(e) => set("centroCusto", e.target.value)}
              placeholder="Ex: Obra Edifício Central"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição da RM</label>
          <input
            type="text"
            value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="Ex: Compra de tintas para obra Edifício Central"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
          <textarea
            value={form.observacao}
            onChange={(e) => set("observacao", e.target.value)}
            rows={2}
            placeholder="Observações adicionais..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="text-sm font-medium text-gray-700">Itens da Requisição</label>
            <button
              onClick={addItem}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Plus size={16} /> Adicionar item
            </button>
          </div>
          <div className="space-y-3">
            {form.itens.map((it, i) => (
              <div key={i} className="flex gap-3 items-start bg-gray-50 rounded-lg p-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={it.descricao}
                    onChange={(e) => setItem(i, "descricao", e.target.value)}
                    placeholder="Descrição do item"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="w-24">
                  <input
                    type="number"
                    value={it.qtd}
                    min={1}
                    onChange={(e) => setItem(i, "qtd", Number(e.target.value))}
                    placeholder="Qtd"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="w-24">
                  <select
                    value={it.unidade}
                    onChange={(e) => setItem(i, "unidade", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {UNIDADES.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
                {form.itens.length > 1 && (
                  <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 mt-1">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => router.push("/")}
            className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Criar RM
          </button>
        </div>
      </div>
    </div>
  );
}
