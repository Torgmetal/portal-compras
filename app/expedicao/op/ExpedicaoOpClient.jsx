"use client";
import { useState, useMemo } from "react";
import { fmtOP } from "@/lib/utils";
import { PackageCheck, Search, Package, ArrowLeft } from "lucide-react";
import AbaExpedicao from "@/app/comercial/[id]/AbaExpedicao";

// Espelho da expedição do módulo OPs: a Expedição escolhe a OP e vê os LOTES DE
// ENTREGA + emite/revisa o romaneio (FORM 22) — o MESMO fluxo/entidades do módulo
// OPs (LoteExpedicao/RomaneioPrevio), sem gerenciar lotes (isso fica no OP).
export default function ExpedicaoOpClient({ ops }) {
  const [opSel, setOpSel] = useState(null);
  const [busca, setBusca] = useState("");

  const opsFiltradas = useMemo(() => {
    if (!busca.trim()) return ops;
    const q = busca.toLowerCase();
    return ops.filter((o) => o.numero?.toLowerCase().includes(q) || o.cliente?.toLowerCase().includes(q) || o.obra?.toLowerCase().includes(q));
  }, [ops, busca]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-3">
          <PackageCheck size={28} className="text-torg-blue" /> Expedição por OP
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Lotes de entrega e emissão de romaneios (FORM 22) por OP.
        </p>
      </div>

      {!opSel ? (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar OP por número, cliente ou obra..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>
          {opsFiltradas.length === 0 ? (
            <div className="text-center py-12 text-torg-gray">
              <Package size={32} className="mx-auto mb-2 text-gray-300" /> <p className="text-sm">Nenhuma OP encontrada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {opsFiltradas.map((op) => (
                <button key={op.id} onClick={() => setOpSel(op)}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:border-torg-blue hover:shadow-md transition-all group">
                  <p className="font-mono text-lg font-bold text-torg-blue group-hover:text-torg-blue-700">{fmtOP(op.numero)}</p>
                  <p className="text-sm text-torg-dark mt-1 truncate">{op.cliente}</p>
                  {op.obra && <p className="text-xs text-torg-gray truncate">{op.obra}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <button onClick={() => setOpSel(null)} className="text-sm text-torg-blue hover:text-torg-blue-700 flex items-center gap-1 mb-2">
              <ArrowLeft size={14} /> Voltar às OPs
            </button>
            <h3 className="text-2xl font-extrabold text-torg-dark tracking-tight">
              <span className="font-mono text-torg-blue">{fmtOP(opSel.numero)}</span>
              <span className="text-lg font-normal text-torg-gray ml-2">— {opSel.cliente}</span>
            </h3>
            {opSel.obra && <p className="text-sm text-torg-gray">{opSel.obra}</p>}
          </div>

          {/* Mesmo workspace do módulo OPs — Expedição vê os lotes e emite/revisa romaneio */}
          <AbaExpedicao opId={opSel.id} proposta={null} podeEditarLotes={false} />
        </div>
      )}
    </div>
  );
}
