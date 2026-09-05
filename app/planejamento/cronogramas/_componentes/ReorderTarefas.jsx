"use client";
import { useEffect, useState } from "react";
import { corDaArea } from "@/lib/cronograma-area-cor";
import { ChevronDown, ChevronUp } from "lucide-react";

// Lista de reordenação (staged): move com ↑/↓, sem tocar no servidor até salvar.
export function ReorderTarefas({ ordem, onMove, areas }) {
  return (
    <div className="space-y-1">
      {ordem.map((t, i) => {
        const c = t.area ? corDaArea(t.area, areas) : null;
        return (
          <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 border border-gray-100 rounded bg-white">
            <div className="flex flex-col leading-none">
              <button onClick={() => onMove(i, -1)} disabled={i === 0} className="text-torg-gray hover:text-torg-blue disabled:opacity-25"><ChevronUp size={13} /></button>
              <button onClick={() => onMove(i, 1)} disabled={i === ordem.length - 1} className="text-torg-gray hover:text-torg-blue disabled:opacity-25"><ChevronDown size={13} /></button>
            </div>
            <span className="text-[10px] text-torg-gray w-5 text-right tabular-nums">{i + 1}</span>
            <span className="text-xs text-torg-dark truncate flex-1">{t.nome}</span>
            {c && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border shrink-0" style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}>
                {t.area}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Duração editável DIRETO na linha (o "Gerar Datas" usa isso). Salva no blur/Enter.
export function DuracaoInline({ tarefa, tipoDias, onSaved }) {
  const [v, setV] = useState(tarefa.duracaoDias || 0);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setV(tarefa.duracaoDias || 0); }, [tarefa.duracaoDias]);
  const salvar = async () => {
    const nova = Math.max(0, Math.min(9999, parseInt(v) || 0));
    if (nova === (tarefa.duracaoDias || 0)) return;
    setSaving(true);
    try {
      await fetch(`/api/planejamento/cronogramas/tarefas/${tarefa.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ duracaoDias: nova }),
      });
      onSaved?.();
    } catch { /* silencioso */ } finally { setSaving(false); }
  };
  const un = (tipoDias || "DU") === "DU" ? "du" : "dc";
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" title={`Duração em dias (${un === "du" ? "úteis" : "corridos"}) — usada no Gerar Datas`}>
      <input
        type="number" min={0} max={9999}
        value={v || ""}
        onChange={(e) => setV(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        placeholder="dias"
        className="w-12 text-[10px] text-center border border-gray-200 rounded px-1 py-0.5 focus:border-torg-blue outline-none"
      />
      <span className="text-[9px] text-torg-gray w-3">{saving ? "…" : un}</span>
    </span>
  );
}
