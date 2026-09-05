"use client";
import { fmtOP } from "@/lib/utils";
import { AlertTriangle, ChevronRight, Clock, Factory } from "lucide-react";
import { fmtData } from "../_lib/formatos";
import { DEPT_COLORS, DEPT_ICONS, DEPT_LABEL } from "../_lib/rotulos";

export function CronogramaCard({ cronograma, onToggle }) {
  const c = cronograma;
  const now = new Date();
  const diasRestantes = c.dataFim
    ? Math.ceil((new Date(c.dataFim) - now) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors">
        <div className="flex items-center gap-3">
          <ChevronRight size={16} className="text-torg-gray" />
          <span className="text-sm font-bold text-torg-blue font-mono">{fmtOP(c.opNumero)}</span>
          <span className="text-sm text-torg-dark font-medium truncate max-w-xs">{c.titulo}</span>
          {c.op && <span className="text-xs text-torg-gray">({c.op.cliente})</span>}
          {c.op?.status === "ENCERRADA" && (
            <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">OP Encerrada</span>
          )}
          {c.op?.status === "CANCELADA" && (
            <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-semibold">OP Cancelada</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {c.atrasados > 0 && (
            <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-semibold rounded-full flex items-center gap-1">
              <AlertTriangle size={10} /> {c.atrasados} atrasado{c.atrasados > 1 ? "s" : ""}
            </span>
          )}
          {diasRestantes !== null && (
            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full flex items-center gap-1 ${
              diasRestantes < 0 ? "bg-red-50 text-red-600"
              : diasRestantes <= 14 ? "bg-amber-50 text-amber-700"
              : "bg-gray-100 text-torg-gray"
            }`}>
              <Clock size={10} />
              {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d restantes`}
            </span>
          )}
          <span className="text-[10px] text-torg-gray">
            {fmtData(c.dataInicio)} — {fmtData(c.dataFim)}
          </span>
        </div>
      </button>

      {/* Department summary pills */}
      {c.deptSummary?.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {c.deptSummary.map((d, i) => {
            const Icon = DEPT_ICONS[d.departamento] || Factory;
            return (
              <span
                key={i}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-full border flex items-center gap-1 ${
                  d.atrasado ? "bg-red-50 text-red-600 border-red-200" : (DEPT_COLORS[d.departamento] || "bg-gray-50 text-torg-gray border-gray-200")
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
    </div>
  );
}
