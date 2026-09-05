"use client";
import { useState } from "react";
import { fmtOP } from "@/lib/utils";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Factory, Loader2 } from "lucide-react";
import { CronogramaExpandido } from "./CronogramaExpandido";
import { fmtData } from "../_lib/formatos";
import { DEPT_COLORS, DEPT_ICONS, DEPT_LABEL } from "../_lib/rotulos";

export function HistoricoEncerrados({ encerrados, loading, onReabrir, expandedId, onToggle, detail, loadingDetail, onRefreshDetail }) {
  const [reabrindo, setReabrindo] = useState(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-torg-gray" size={20} />
        <span className="ml-2 text-sm text-torg-gray">Carregando histórico...</span>
      </div>
    );
  }

  if (encerrados.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
        <Archive size={32} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhum cronograma encerrado.</p>
        <p className="text-xs text-torg-gray mt-1">Cronogramas encerrados aparecem aqui para consulta.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {encerrados.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden opacity-90">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => onToggle(c.id)} className="flex items-center gap-3 text-left flex-1 min-w-0">
              {expandedId === c.id ? <ChevronDown size={16} className="text-torg-gray" /> : <ChevronRight size={16} className="text-torg-gray" />}
              <span className="text-sm font-bold text-torg-gray font-mono">{fmtOP(c.opNumero)}</span>
              <span className="text-sm text-torg-dark/70 font-medium truncate max-w-xs">{c.titulo}</span>
              {c.op && <span className="text-xs text-torg-gray">({c.op.cliente})</span>}
              <span className="text-[9px] bg-gray-100 text-torg-gray px-1.5 py-0.5 rounded font-medium">
                Encerrado
              </span>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-torg-gray">
                {fmtData(c.dataInicio)} — {fmtData(c.dataFim)}
              </span>
              <button
                onClick={async () => {
                  if (!confirm(`Reabrir o cronograma ${fmtOP(c.opNumero)} — ${c.titulo}?`)) return;
                  setReabrindo(c.id);
                  await onReabrir(c.id);
                  setReabrindo(null);
                }}
                disabled={reabrindo === c.id}
                className="px-2.5 py-1 text-[10px] font-medium text-torg-blue bg-torg-blue-50 border border-torg-blue/20 rounded-lg hover:bg-torg-blue-100 flex items-center gap-1 disabled:opacity-50"
              >
                {reabrindo === c.id ? <Loader2 size={10} className="animate-spin" /> : <ArchiveRestore size={10} />}
                Reabrir
              </button>
            </div>
          </div>

          {/* Department summary pills */}
          {expandedId !== c.id && c.deptSummary?.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {c.deptSummary.map((d, i) => {
                const Icon = DEPT_ICONS[d.departamento] || Factory;
                return (
                  <span
                    key={i}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-full border flex items-center gap-1 ${
                      DEPT_COLORS[d.departamento] || "bg-gray-50 text-torg-gray border-gray-200"
                    }`}
                  >
                    <Icon size={10} />
                    {DEPT_LABEL[d.departamento] || d.nome}
                    <span className="font-bold">{d.percentual}%</span>
                  </span>
                );
              })}
            </div>
          )}

          {expandedId === c.id && (
            <CronogramaExpandido
              detail={detail}
              loadingDetail={loadingDetail}
              onRefreshDetail={() => onRefreshDetail(c.id)}
              cronogramaId={c.id}
              onDeleted={() => {}}
              readOnly
            />
          )}
        </div>
      ))}
    </div>
  );
}
