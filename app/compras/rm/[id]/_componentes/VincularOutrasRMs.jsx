"use client";
import { fmtOP } from "@/lib/utils";

// Marcar outras RMs pra consolidar os itens numa proposta so.
export function VincularOutrasRMs({
  outrasRMs,
  rm,
  rmsExtrasIds,
  toggleRmExtra,
}) {
  if (outrasRMs.length === 0) return null;
  return (
    <div>
      <label className="block text-sm font-medium text-torg-dark mb-1">
        Vincular outras RMs (opcional)
      </label>
      <p className="text-[11px] text-torg-gray mb-2">
        Marque RMs adicionais pra mandar todos os itens delas pro mesmo fornecedor numa proposta só.
      </p>
      <div className="border border-gray-200 rounded-lg max-h-[150px] overflow-y-auto divide-y divide-gray-100">
        {outrasRMs.map((r) => {
          const checked = rmsExtrasIds.has(r.id);
          const mesmoOp = r.opId === rm.opId;
          return (
            <label key={r.id} className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleRmExtra(r.id)}
                className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
              />
              <span className="font-mono font-semibold text-torg-blue">{r.numero}</span>
              <span className="text-torg-dark truncate flex-1">{r.descricao}</span>
              {r.op && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${mesmoOp ? "bg-torg-blue-50 text-torg-blue" : "bg-gray-100 text-torg-gray"}`}>
                  {fmtOP(r.op.numero)}
                </span>
              )}
              <span className="text-[10px] text-torg-gray">{r.itens.length} itens</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
