"use client";
import { useState, useMemo } from "react";
import { PackageSearch, Search, X, Inbox } from "lucide-react";

const fmtQtd = (v, unidade = "") =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unidade}`.trim() : "—";

export default function EstoqueProducaoClient({ itens }) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    if (!busca) return itens;
    const b = busca.toLowerCase();
    return itens.filter((i) => {
      const hay = `${i.descricao} ${i.codigoOmie} ${i.codigoIntegracao || ""}`.toLowerCase();
      return hay.includes(b);
    });
  }, [itens, busca]);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <PackageSearch size={24} className="text-torg-blue" />
          Estoque — Matéria-Prima
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Consulta rápida de saldo em estoque dos itens de matéria-prima.
        </p>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por descrição ou código..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
        />
        {busca && (
          <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-torg-dark">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <Inbox size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-torg-gray">
            {busca ? "Nenhum item encontrado para essa busca." : "Nenhum item de matéria-prima no estoque."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Descrição
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Família
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Qtd em estoque
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Unidade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map((i) => {
                  const semEstoque = !(i.qtdAtual > 0);
                  return (
                    <tr key={i.id} className={`hover:bg-gray-50 transition-colors ${semEstoque ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3 font-mono text-xs text-torg-gray whitespace-nowrap">
                        {i.codigoOmie}
                      </td>
                      <td className="px-4 py-3 text-torg-dark font-medium">
                        {i.descricao}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {i.categoriaLabel ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                            {i.categoriaLabel}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap font-semibold ${semEstoque ? "text-red-400" : "text-torg-dark"}`}>
                        {fmtQtd(i.qtdAtual)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-torg-gray whitespace-nowrap">
                        {i.unidade || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
