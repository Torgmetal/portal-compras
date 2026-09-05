"use client";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

// Resultado do recalculo de datas.
export function AvisoRecalculo({
  recalcMsg,
  setRecalcMsg,
}) {
  return (
    <div className={`px-4 py-2 text-xs flex items-center gap-1.5 ${recalcMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
      {recalcMsg.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
      {recalcMsg.msg}
      <button onClick={() => setRecalcMsg(null)} className="ml-auto p-0.5 hover:opacity-70"><X size={10} /></button>
    </div>
  );
}
