"use client";
import { useEffect, useRef, useState } from "react";
import { PALETA_AREAS, corDaArea } from "@/lib/cronograma-area-cor";
import { ChevronDown, ChevronRight, Layers, Loader2, Pencil, Plus } from "lucide-react";

// Painel "Áreas da obra" — define/renomeia/recolore as áreas do cronograma.
// Corrige cor repetida: auto-cadastra (cores distintas) as áreas em uso ainda não fixadas.
export function GestorAreas({ cronogramaId, areas, tarefas, onRefresh, readOnly }) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pickerCor, setPickerCor] = useState(null);
  const jaSync = useRef(false);

  const registradas = Array.isArray(areas) ? areas : [];
  const contagem = {};
  const usadas = new Map(); // key -> nome original
  for (const t of tarefas || []) {
    const nome = (t.area || "").trim();
    if (!nome) continue;
    const key = nome.toLowerCase();
    contagem[key] = (contagem[key] || 0) + 1;
    if (!usadas.has(key)) usadas.set(key, nome);
  }
  const regKeys = new Set(registradas.map((a) => (a?.nome || "").trim().toLowerCase()));
  const naoFixadas = [...usadas.values()].filter((n) => !regKeys.has(n.toLowerCase()));
  const lista = [...registradas.map((a) => a.nome), ...naoFixadas];

  const chamar = async (body) => {
    setSalvando(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/areas`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(`Erro: ${e.error || "falha"}`); return; }
      onRefresh();
    } catch { alert("Erro de conexão."); } finally { setSalvando(false); }
  };

  // Uma vez por montagem: fixa cores distintas nas áreas em uso ainda não cadastradas.
  useEffect(() => {
    if (readOnly || jaSync.current) return;
    if (naoFixadas.length > 0) { jaSync.current = true; chamar({ acao: "sincronizar" }); }
  }, [naoFixadas.length, readOnly]);

  const adicionar = () => {
    const nome = window.prompt("Nome da nova área:");
    if (!nome?.trim()) return;
    const usados = new Set(registradas.map((a) => a.cor));
    let cor = 0; while (usados.has(cor) && cor < 9) cor++;
    chamar({ acao: "recolor", nome: nome.trim(), cor });
  };
  const renomear = (de) => {
    const para = window.prompt(`Renomear área "${de}" para:`, de);
    if (para == null || !para.trim() || para.trim() === de) return;
    chamar({ acao: "renomear", de, para: para.trim() });
  };

  if (!lista.length && readOnly) return null;

  return (
    <div className="px-4 pt-3">
      <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-torg-dark">
        {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Layers size={13} className="text-torg-blue" /> Áreas da obra
        <span className="text-[10px] text-torg-gray font-normal">({lista.length})</span>
        {salvando && <Loader2 size={11} className="animate-spin text-torg-gray" />}
      </button>
      {aberto && (
        <div className="mt-2 border border-gray-100 rounded-lg p-2 space-y-1 bg-gray-50/40 max-w-xl">
          {lista.length === 0 && <p className="text-[11px] text-torg-gray italic px-1">Nenhuma área ainda. {!readOnly && 'Use "+ adicionar" ou classifique uma tarefa.'}</p>}
          {lista.map((nome) => {
            const cor = corDaArea(nome, areas);
            return (
              <div key={nome} className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <button disabled={readOnly} onClick={() => setPickerCor(pickerCor === nome ? null : nome)} className="w-5 h-5 rounded border disabled:cursor-default" style={{ backgroundColor: cor.bg, borderColor: cor.border }} title={readOnly ? "" : "Trocar a cor"} />
                  {pickerCor === nome && (
                    <div className="absolute left-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex gap-1 flex-wrap w-[124px]">
                      {PALETA_AREAS.map((c, i) => (
                        <button key={i} onClick={() => { setPickerCor(null); chamar({ acao: "recolor", nome, cor: i }); }} className="w-5 h-5 rounded border hover:scale-110 transition-transform" style={{ backgroundColor: c.bg, borderColor: c.border }} title={`Cor ${i + 1}`} />
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-torg-dark flex-1 truncate" title={nome}>{nome}</span>
                <span className="text-[10px] text-torg-gray shrink-0">{contagem[nome.toLowerCase()] || 0} tarefa(s)</span>
                {!readOnly && <button onClick={() => renomear(nome)} className="text-torg-gray hover:text-torg-blue p-0.5 shrink-0" title="Renomear"><Pencil size={11} /></button>}
              </div>
            );
          })}
          {!readOnly && (
            <button onClick={adicionar} className="text-[11px] text-torg-blue hover:text-torg-blue-700 font-medium flex items-center gap-1 pt-1"><Plus size={12} /> adicionar área</button>
          )}
        </div>
      )}
    </div>
  );
}
