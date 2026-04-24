"use client";
import { useState, useMemo } from "react";
import { X, FileSpreadsheet, Download, AlertCircle } from "lucide-react";

export default function ExportOmieModal({
  open,
  onClose,
  pedidosPorFornecedor,
  onConfirm,
  loading,
}) {
  const [categoria, setCategoria] = useState("");
  const [localEstoque, setLocalEstoque] = useState("");
  const [erro, setErro] = useState("");

  const grupos = useMemo(
    () => Object.values(pedidosPorFornecedor || {}),
    [pedidosPorFornecedor]
  );

  if (!open) return null;

  const confirmar = async () => {
    setErro("");
    if (!categoria.trim()) return setErro("Informe a Categoria de Compra.");
    if (!localEstoque.trim()) return setErro("Informe o Local de Estoque.");
    try {
      await onConfirm({ categoria: categoria.trim(), localEstoque: localEstoque.trim() });
    } catch (e) {
      setErro(e.message || "Erro ao gerar planilhas");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-emerald-600" />
            Gerar Planilhas Omie
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            Será gerado <strong>1 arquivo .xlsx por fornecedor vencedor</strong>, no
            layout oficial de importação do Omie.
          </p>

          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="text-gray-500 mb-2">Serão geradas {grupos.length} planilha(s):</p>
            <ul className="space-y-1">
              {grupos.map((g) => (
                <li key={g.fornecedor} className="flex justify-between text-gray-700">
                  <span>{g.fornecedor}</span>
                  <span className="text-gray-500">
                    {g.itens.length} item{g.itens.length !== 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoria de Compra <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex: 2.01.02 ou descrição da categoria"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              disabled={loading}
            />
            <p className="text-xs text-gray-400 mt-1">
              Varia por tipo de material. Use o código ou nome exato como está no seu Omie.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Local de Estoque <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={localEstoque}
              onChange={(e) => setLocalEstoque(e.target.value)}
              placeholder="Código ou descrição do local de estoque"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <p>
              <strong>Conta Corrente:</strong> Inter
              <span className="mx-2">·</span>
              <strong>Previsão de Entrega:</strong> hoje
              <span className="mx-2">·</span>
              <strong>Parcelas:</strong> cadastradas em cada fornecedor
            </p>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            disabled={loading}
          >
            <Download size={16} />
            {loading ? "Gerando..." : "Gerar e Baixar"}
          </button>
        </div>
      </div>
    </div>
  );
}
