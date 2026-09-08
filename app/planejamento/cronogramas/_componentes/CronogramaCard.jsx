"use client";
import { fmtOP } from "@/lib/utils";
import { AlertTriangle, ChevronRight, Clock } from "lucide-react";

const dataCurta = valor => valor ? new Date(valor).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

export function CronogramaCard({ cronograma: c, onToggle }) {
  const diasRestantes = c.dataFim ? Math.ceil((new Date(c.dataFim) - new Date()) / 86400000) : null;
  const prazo = diasRestantes === null ? null : diasRestantes < 0 ? `${Math.abs(diasRestantes)}d de atraso` : diasRestantes === 0 ? "Término hoje" : `${diasRestantes}d restantes`;

  return (
    <button onClick={onToggle} aria-label={`Abrir cronograma ${fmtOP(c.opNumero)} — ${c.titulo}`} className="group block w-full px-4 sm:px-5 py-5 text-left hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-torg-blue transition-colors">
      <span className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 lg:gap-6">
        <span className="flex min-w-0 items-start gap-3">
          <span className="shrink-0 whitespace-nowrap rounded-md border border-torg-blue/10 bg-torg-blue-50/70 px-2.5 py-1 text-sm font-semibold tabular-nums text-torg-blue">{fmtOP(c.opNumero)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-6 text-torg-dark" title={c.titulo}>{c.titulo}</span>
            <span className="mt-0.5 block truncate text-xs text-torg-gray" title={c.op?.cliente || ""}>{c.op?.cliente || "Cliente não informado"}</span>
            {c.op?.status === "ENCERRADA" && <span className="mt-1 block text-xs text-torg-gray">OP encerrada</span>}
            {c.op?.status === "CANCELADA" && <span className="mt-1 block text-xs text-red-600">OP cancelada</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center justify-between lg:justify-end gap-3">
          <span className="flex flex-wrap lg:flex-col items-center lg:items-end gap-x-3 gap-y-1">
            <span className="text-xs tabular-nums whitespace-nowrap text-torg-gray">{dataCurta(c.dataInicio)} <span className="mx-1 text-slate-400">→</span> {dataCurta(c.dataFim)}</span>
            <span className="flex items-center gap-3">
              {prazo && <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${diasRestantes < 0 ? "text-red-600" : diasRestantes <= 14 ? "text-amber-700" : "text-torg-gray"}`}><Clock size={12}/>{prazo}</span>}
              {c.atrasados > 0 && <span className="inline-flex items-center gap-1 text-xs text-red-600 whitespace-nowrap"><AlertTriangle size={12}/>{c.atrasados} tarefa{c.atrasados > 1 ? "s" : ""} em atraso</span>}
            </span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-slate-400 group-hover:text-torg-blue" />
        </span>
      </span>
    </button>
  );
}
