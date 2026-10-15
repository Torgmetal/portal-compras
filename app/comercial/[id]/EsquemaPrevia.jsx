"use client";
import { AlertCircle } from "lucide-react";
import { linhasDoEsquemaPdf, problemasDoEsquema } from "@/lib/plp-esquema";

// prévia do "Esquema por estrutura" (o mesmo quadro do PDF) e o que impede lê-lo
export default function EsquemaPrevia({ plano }) {
  const linhas = linhasDoEsquemaPdf(plano);
  const problemas = problemasDoEsquema(plano);
  if (!linhas.length && !problemas.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
      <p className="text-[12px] font-semibold text-torg-dark">Esquema por estrutura</p>
      <p className="text-[11px] text-torg-gray">Demãos com o mesmo número são alternativas: a cor do item escolhe qual vai em cada estrutura.</p>
      {linhas.map(([item, cor, seq]) => (
        <div key={item} className="text-[12px] border-t border-gray-50 pt-1.5">
          <span className="font-semibold text-torg-dark">{item}</span> <span className="text-torg-gray">· {cor}</span>
          <div className="whitespace-pre-line text-torg-dark">{seq}</div>
        </div>
      ))}
      {problemas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-[12px] text-amber-800 space-y-0.5">
          {problemas.map((t) => <p key={t} className="flex gap-1"><AlertCircle size={13} className="shrink-0 mt-0.5" />{t}</p>)}
        </div>
      )}
    </div>
  );
}
