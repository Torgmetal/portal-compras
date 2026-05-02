"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import ItemFormRow, { novoItem } from "@/components/ItemFormRow";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function NovaOP() {
  const router = useRouter();
  const [form, setForm] = useState({
    numero: "", cliente: "", obra: "", descricao: "",
    dataInicio: "", dataFimPrevista: "",
  });
  const [itens, setItens] = useState([novoItem()]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const updateItem = (i, novo) => {
    setItens((prev) => prev.map((it, idx) => (idx === i ? novo : it)));
  };
  const addItem = (categoria = "MATERIA_PRIMA") => setItens((p) => [...p, novoItem(categoria)]);
  const removeItem = (i) => setItens((prev) => prev.filter((_, idx) => idx !== i));

  const totalVerba = useMemo(
    () => itens.reduce((s, it) => s + (Number(it.valorVerba) || 0), 0),
    [itens]
  );

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    if (!form.numero.trim() || !form.cliente.trim()) {
      setErro("Número da OP e Cliente são obrigatórios.");
      return;
    }
    const validos = itens.filter((it) => it.descricao.trim());
    if (validos.length === 0) {
      setErro("Adicione pelo menos um item.");
      return;
    }

    setSalvando(true);
    try {
      const res = await fetch("/api/comercial/op", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, itens: validos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar OP");
      router.push(`/comercial/${data.id}`);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/comercial" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Nova OP</h2>
        <p className="text-sm text-torg-gray mt-1">
          Cadastro inicial do contrato. Itens são uma estimativa por categoria — engenharia detalha depois.
        </p>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* Dados gerais */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-torg-dark">Dados gerais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Nº OP *</label>
            <input
              type="text" value={form.numero} required
              onChange={(e) => set("numero", e.target.value.toUpperCase())}
              placeholder="Ex: T083"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono font-semibold focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Cliente *</label>
            <input
              type="text" value={form.cliente} required
              onChange={(e) => set("cliente", e.target.value)}
              placeholder="Ex: JHSF"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Obra</label>
            <input
              type="text" value={form.obra}
              onChange={(e) => set("obra", e.target.value)}
              placeholder="Ex: Mezanino Industrial"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Descrição</label>
          <textarea
            value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            rows={2}
            placeholder="Escopo geral do contrato"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Data de início</label>
            <input
              type="date" value={form.dataInicio}
              onChange={(e) => set("dataInicio", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Data de fim prevista</label>
            <input
              type="date" value={form.dataFimPrevista}
              onChange={(e) => set("dataFimPrevista", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-lg font-semibold text-torg-dark">Itens contratados ({itens.length})</h3>
          <div className="flex gap-2">
            <button
              type="button" onClick={() => addItem("MATERIA_PRIMA")}
              className="text-sm text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"
            >
              <Plus size={14} /> Material
            </button>
            <button
              type="button" onClick={() => addItem("ALUGUEL_PLATAFORMA")}
              className="text-sm text-torg-orange-700 hover:text-torg-dark inline-flex items-center gap-1 font-medium"
            >
              <Plus size={14} /> Aluguel
            </button>
            <button
              type="button" onClick={() => addItem("OUTRO")}
              className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 font-medium"
            >
              <Plus size={14} /> Outro
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {itens.map((it, i) => (
            <ItemFormRow
              key={i}
              item={it}
              onChange={(novo) => updateItem(i, novo)}
              onRemove={() => removeItem(i)}
              canRemove={itens.length > 1}
            />
          ))}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end items-center gap-4">
          <span className="text-sm text-torg-gray">Total da verba contratada:</span>
          <span className="text-xl font-extrabold text-torg-orange-700 tabular-nums">{fmtMoeda(totalVerba)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link href="/comercial" className="px-5 py-2.5 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancelar
        </Link>
        <button
          type="submit" disabled={salvando}
          className="px-6 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={16} className="animate-spin" />}
          {salvando ? "Salvando..." : "Criar OP"}
        </button>
      </div>
    </form>
  );
}
