"use client";
import { History } from "lucide-react";

export function HistoricoTab({ revisoes }) {
  if (revisoes.length === 0) {
    return (
      <div className="py-8 text-center">
        <History size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhuma alteração registrada.</p>
        <p className="text-xs text-torg-gray mt-1">Defina a data base para iniciar o controle de revisões.</p>
      </div>
    );
  }

  const TIPO_BADGE = {
    BASELINE_DEFINIDA: { label: "Baseline", color: "bg-torg-blue-50 text-torg-blue" },
    TAREFA_ALTERADA: { label: "Tarefa", color: "bg-amber-50 text-amber-700" },
    SYNC_SHAREPOINT: { label: "Sync", color: "bg-purple-50 text-purple-700" },
    DATA_ALTERADA: { label: "Data", color: "bg-emerald-50 text-emerald-700" },
  };

  return (
    <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
      {revisoes.map((r) => {
        const badge = TIPO_BADGE[r.tipo] || TIPO_BADGE.TAREFA_ALTERADA;
        return (
          <div key={r.id} className="flex items-start gap-3 px-3 py-2 rounded-lg border border-gray-100 bg-white hover:bg-gray-50/50">
            <div className="mt-0.5">
              <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${badge.color}`}>{badge.label}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-torg-dark">{r.descricao}</p>
              <p className="text-[10px] text-torg-gray mt-0.5">
                {r.createdBy?.name} · {new Date(r.createdAt).toLocaleDateString("pt-BR")} às{" "}
                {new Date(r.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
