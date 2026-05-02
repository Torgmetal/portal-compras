"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, ArrowLeft, Loader2, AlertCircle } from "lucide-react";

const UNIDADES = ["UN", "KG", "TON", "LT", "M", "M²", "CX", "PC", "GL", "TB", "RL", "PAR", "JG", "SC", "VB", "CJ", "PCT", "barra(s)"];

const itemVazio = () => ({
  descricao: "",
  unidade: "UN",
  qtdContratada: 1,
  valorVerba: 0,
  faturamentoDireto: false,
  observacao: "",
  codigoOmie: "",
});

export default function NovaOP() {
  const router = useRouter();
  const [form, setForm] = useState({
    numero: "",
    cliente: "",
    obra: "",
    descricao: "",
    dataInicio: "",
    dataFimPrevista: "",
  });
  const [itens, setItens] = useState([itemVazio()]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i, k, v) => {
    setItens((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [k]: v };
      return copy;
    });
  };
  const addItem = () => setItens((prev) => [...prev, itemVazio()]);
  const removeItem = (i) => setItens((prev) => prev.filter((_, idx) => idx !== i));

  const totalVerba = itens.reduce((s, it) => s + (Number(it.valorVerba) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    if (!form.numero.trim() || !form.cliente.trim()) {
      setErro("Número da OP e Cliente são obrigatórios.");
      return;
    }
    const itensValidos = itens.filter((it) => it.descricao.trim());
    if (itensValidos.length === 0) {
      setErro("Adicione pelo menos um item.");
      return;
    }

    setSalvando(true);
    try {
      const res = await fetch("/api/comercial/op", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, itens: itensValidos }),
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
    <form onSubmit={submit} className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/comercial" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Nova OP</h2>
        <p className="text-sm text-torg-gray mt-1">Cadastro inicial do contrato — itens, verbas e prazos.</p>
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
              type="text"
              value={form.numero}
              onChange={(e) => set("numero", e.target.value.toUpperCase())}
              placeholder="Ex: T083"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono font-semibold focus:ring-2 focus:ring-torg-blue focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Cliente *</label>
            <input
              type="text"
              value={form.cliente}
              onChange={(e) => set("cliente", e.target.value)}
              placeholder="Ex: JHSF"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Obra</label>
            <input
              type="text"
              value={form.obra}
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Data de início</label>
            <input
              type="date"
              value={form.dataInicio}
              onChange={(e) => set("dataInicio", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Data de fim prevista</label>
            <input
              type="date"
              value={form.dataFimPrevista}
              onChange={(e) => set("dataFimPrevista", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark">Itens contratados ({itens.length})</h3>
          <button
            type="button"
            onClick={addItem}
            className="text-sm text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"
          >
            <Plus size={16} /> Adicionar item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição *</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cód. Omie</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unid.</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd contratada</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Verba (R$)</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Fat. direto</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Obs</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {itens.map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={it.descricao}
                      onChange={(e) => setItem(i, "descricao", e.target.value)}
                      placeholder="Ex: Viga IPN-200"
                      className="w-full min-w-[180px] border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-torg-blue"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={it.codigoOmie}
                      onChange={(e) => setItem(i, "codigoOmie", e.target.value)}
                      placeholder="—"
                      className="w-24 border border-gray-200 rounded px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-torg-blue"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={it.unidade}
                      onChange={(e) => setItem(i, "unidade", e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-torg-blue"
                    >
                      {UNIDADES.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={it.qtdContratada}
                      onChange={(e) => setItem(i, "qtdContratada", parseFloat(e.target.value) || 0)}
                      className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:ring-1 focus:ring-torg-blue tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={it.valorVerba}
                      onChange={(e) => setItem(i, "valorVerba", parseFloat(e.target.value) || 0)}
                      className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:ring-1 focus:ring-torg-blue tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={it.faturamentoDireto}
                      onChange={(e) => setItem(i, "faturamentoDireto", e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-torg-orange focus:ring-torg-orange"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={it.observacao}
                      onChange={(e) => setItem(i, "observacao", e.target.value)}
                      placeholder="—"
                      className="w-full min-w-[120px] border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-torg-blue"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {itens.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-3 py-3 text-right text-sm font-semibold text-torg-dark">
                  Total da verba contratada:
                </td>
                <td className="px-3 py-3 text-right text-base font-bold text-torg-orange-700 tabular-nums">
                  {totalVerba.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link
          href="/comercial"
          className="px-5 py-2.5 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={salvando}
          className="px-6 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={16} className="animate-spin" />}
          {salvando ? "Salvando..." : "Criar OP"}
        </button>
      </div>
    </form>
  );
}
