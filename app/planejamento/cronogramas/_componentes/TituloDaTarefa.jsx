"use client";
import { corDaArea } from "@/lib/cronograma-area-cor";
import { AlertTriangle, CheckCircle2, Clock, Layers, Link2, Lock } from "lucide-react";

// Identificação e avisos com espaço próprio para textos longos.
export function TituloDaTarefa({
  allTarefas,
  antecessorasIncompletas,
  areas,
  atrasada,
  bloqueada,
  concluida,
  editArea,
  editNome,
  editing,
  setEditArea,
  setEditNome,
  t,
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      {concluida ? (
        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
      ) : bloqueada ? (
        <Lock size={14} className="text-amber-500 shrink-0" />
      ) : atrasada ? (
        <AlertTriangle size={14} className="text-red-500 shrink-0" />
      ) : (
        <Clock size={14} className="text-torg-gray shrink-0" />
      )}
      {editing ? (
        <input
          value={editNome}
          onChange={(e) => setEditNome(e.target.value)}
          className="text-xs font-medium px-1.5 py-0.5 border border-torg-blue/30 rounded bg-white flex-1 min-w-0 outline-none focus:border-torg-blue"
        />
      ) : (
        <span className={`min-w-0 text-xs font-semibold [overflow-wrap:anywhere] ${concluida ? "text-torg-gray line-through" : "text-torg-dark"}`}>
          {t.nome}
        </span>
      )}
      {editing && (
        <>
          <input
            value={editArea}
            onChange={(e) => setEditArea(e.target.value)}
            list={`areas-row-${t.departamento || "x"}`}
            placeholder="Área"
            title="Área / parte da obra — agrupa a tarefa dentro do setor"
            className="text-[11px] px-1.5 py-0.5 border border-amber-300 rounded bg-amber-50/40 w-28 outline-none focus:border-amber-500 shrink-0"
          />
          <datalist id={`areas-row-${t.departamento || "x"}`}>
            {[...new Set([
              ...(Array.isArray(areas) ? areas.map((a) => a?.nome).filter(Boolean) : []),
              ...((allTarefas || []).map((x) => x.area).filter((a) => a && a.trim()).map((a) => a.trim())),
            ])].map((a) => <option key={a} value={a} />)}
          </datalist>
        </>
      )}
      {!editing && t.area && (() => { const c = corDaArea(t.area, areas); return (
        <span className="text-[10px] px-1.5 py-0.5 rounded border inline-flex min-w-0 max-w-full items-center gap-1 [overflow-wrap:anywhere]" style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }} title={`Área: ${t.area}`}>
          <Layers size={10} className="shrink-0" /> <span className="min-w-0">{t.area}</span>
        </span>
      ); })()}
      {t.isSummary && <span className="text-[9px] text-torg-gray bg-gray-100 px-1 rounded">grupo</span>}
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-1.5 empty:hidden">
      {!editing && bloqueada && (() => {
        const nomes = antecessorasIncompletas.map((aid) => {
          const ant = (allTarefas || []).find((x) => x.id === aid);
          return ant?.nome || "?";
        });
        const visiveis = nomes.slice(0, 2).join(", ");
        const extra = nomes.length > 2 ? ` +${nomes.length - 2}` : "";
        return (
          <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-1 rounded-md flex min-w-0 max-w-full items-start gap-1 font-medium"
            title={`Não é possível executar esta atividade — aguardando: ${nomes.join(", ")}`}>
            <Lock size={9} className="shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">Não pode iniciar — aguardando: {visiveis}{extra}</span>
          </span>
        );
      })()}
      {!editing && t.antecessoraIds?.length > 0 && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 ${bloqueada ? "text-amber-600 bg-amber-50" : "text-purple-600 bg-purple-50"}`} title={`Depende de: ${t.antecessoraIds.map((aid) => { const ant = (allTarefas || []).find((x) => x.id === aid); return ant?.nome || aid.slice(0, 6); }).join(", ")}`}>
          <Link2 size={8} /> {t.antecessoraIds.length} antecessora{t.antecessoraIds.length > 1 ? "s" : ""}
        </span>
      )}
      {t.dataRealizacao && !editing && (
        <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
          <CheckCircle2 size={9} /> {new Date(t.dataRealizacao).toLocaleDateString("pt-BR")}
        </span>
      )}
      {t.motivoBloqueio && !t.dataLiberacao && !editing && (
        <span className="text-[10px] text-red-700 bg-red-100 px-2 py-1 rounded-md flex min-w-0 max-w-full items-start gap-1 font-medium [overflow-wrap:anywhere]" title={t.motivoBloqueio}>
          <Lock size={9} className="shrink-0" /> <span className="min-w-0">Bloqueado — {t.motivoBloqueio}</span>
        </span>
      )}
      {t.dataLiberacao && !editing && (
        <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0" title={t.motivoBloqueio || "Liberação externa"}>
          <CheckCircle2 size={8} /> Liberada {new Date(t.dataLiberacao).toLocaleDateString("pt-BR")}
        </span>
      )}
      </div>
    </div>
  );
}
