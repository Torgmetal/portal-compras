"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Trash2, RefreshCw } from "lucide-react";

// Histórico de lançamentos CMR excluídos (quem, quando, o quê).
export default function CmrHistoricoClient() {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const j = await fetch("/api/compras/cmr/exclusoes").then((r) => r.json());
      if (!j.success) throw new Error(j.error || "Erro ao carregar");
      setItens(j.itens || []);
    } catch (e) { setErro(e.message); setItens([]); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><Trash2 size={20} className="text-red-600" /> Histórico de exclusões</h1>
          <p className="text-[12px] text-torg-gray mt-0.5">Lançamentos CMR excluídos — quem, quando e o que foi removido.</p>
        </div>
        <button onClick={carregar} className="text-sm font-medium rounded-lg px-3 py-2 inline-flex items-center gap-2 bg-white border border-gray-200 text-torg-gray hover:bg-gray-50">
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        {erro && <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">{erro}</div>}
        <div className="overflow-x-auto">
          {itens === null ? <p className="px-4 py-10 text-center text-torg-gray text-sm"><Loader2 size={16} className="animate-spin inline" /></p>
            : itens.length === 0 ? <p className="px-4 py-10 text-center text-torg-gray text-sm">Nenhuma exclusão registrada.</p>
            : (
              <table className="w-full text-[12px] whitespace-nowrap">
                <thead className="bg-gray-50/60"><tr className="text-[10px] text-gray-500 uppercase">
                  <th className="px-3 py-2 text-left">Data / hora</th><th className="px-3 py-2 text-left">Usuário</th><th className="px-3 py-2 text-left">Índice R</th><th className="px-3 py-2 text-left">Descrição</th><th className="px-3 py-2 text-left">Fornecedor</th><th className="px-3 py-2 text-left">NF</th><th className="px-3 py-2 text-left">Obra</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {itens.map((x) => (
                    <tr key={x.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-1.5 text-torg-gray">{new Date(x.quando).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-1.5">{x.usuario}</td>
                      <td className="px-3 py-1.5 font-mono text-torg-blue">{x.indiceR}</td>
                      <td className="px-3 py-1.5 max-w-[420px] truncate" title={x.nome}>{x.nome}</td>
                      <td className="px-3 py-1.5">{x.fornecedor || "—"}</td>
                      <td className="px-3 py-1.5">{x.nf || "—"}</td>
                      <td className="px-3 py-1.5 font-mono">{x.obra || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}
