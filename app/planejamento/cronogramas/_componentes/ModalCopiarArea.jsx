"use client";
import { useState } from "react";
import { AlertCircle, Copy, Loader2, X } from "lucide-react";
import { corDaArea, normArea } from "@/lib/cronograma-area-cor";
import { DEPT_LABEL } from "../_lib/rotulos";

/**
 * Copiar as tarefas de uma área do setor para outras áreas já cadastradas.
 *
 * Vitor (09/10/2026), OP-118: "selecionar a área criada com todas as informações e datas já criadas (…) e
 * posteriormente fazer as vinculações. As áreas já foram criadas." A cópia leva datas, durações e o
 * encadeamento entre as tarefas da área; o avanço não vai. As vinculações entre áreas (B depois de A, a
 * expedição depois da pintura de cada uma) ficam para depois, na própria tarefa.
 * ⚠ Área que já tem tarefa NESTE setor aparece bloqueada: a rota recusaria, e dois cliques dobrariam a área.
 */
export function ModalCopiarArea({ cronogramaId, dept, origem, areas = [], tarefasDoSetor = [], onFechar, onCopiado }) {
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [manterExternas, setManterExternas] = useState(true);
  const [copiando, setCopiando] = useState(false);
  const [erro, setErro] = useState("");

  const doSetor = tarefasDoSetor.filter((t) => !t.isSummary);
  const daArea = (nome) => doSetor.filter((t) => normArea(t.area) === normArea(nome));
  const qtdOrigem = daArea(origem).length;
  // as áreas cadastradas, na ordem do cadastro (é a ordem das cores e a ordem em que as cópias entram)
  const opcoes = (Array.isArray(areas) ? areas : []).map((a) => a?.nome).filter((n) => n && normArea(n) !== normArea(origem));
  const destinos = opcoes.filter((n) => marcadas.has(n));
  const setor = (DEPT_LABEL[dept] || dept || "").toString();

  const alternar = (nome) => setMarcadas((s) => { const n = new Set(s); n.has(nome) ? n.delete(nome) : n.add(nome); return n; });

  async function copiar() {
    setCopiando(true);
    setErro("");
    try {
      const r = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/areas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "copiar", origem, departamento: dept, destinos, manterExternas }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || "Não foi possível copiar a área.");
      onCopiado?.(j);
      onFechar?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setCopiando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !copiando && onFechar?.()}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-torg-dark flex items-center gap-2"><Copy size={16} className="text-torg-blue" /> Copiar a área {origem}</h3>
          <button onClick={() => !copiando && onFechar?.()} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-torg-gray">
            As <b>{qtdOrigem} tarefas da área {origem}</b>{setor ? ` em ${setor}` : ""} vão para cada área escolhida, com as mesmas datas,
            durações e o encadeamento entre elas. O avanço não é copiado.
          </p>
          <div>
            <p className="text-xs font-medium text-torg-gray mb-1.5">Copiar para</p>
            {!opcoes.length && <p className="text-[11px] text-amber-700">Nenhuma outra área cadastrada. Cadastre as áreas em "Áreas da obra".</p>}
            <div className="space-y-1">
              {opcoes.map((nome) => {
                const ja = daArea(nome).length;
                const cor = corDaArea(nome, areas);
                return (
                  <label key={nome} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${ja ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={marcadas.has(nome)} disabled={!!ja || copiando} onChange={() => alternar(nome)}
                      aria-label={`Copiar para ${nome}`} className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
                    <span className="text-[11px] font-bold rounded px-2 py-0.5 border" style={{ backgroundColor: cor.bg, borderColor: cor.border, color: cor.text }}>{nome}</span>
                    {ja > 0 && <span className="text-[11px] text-torg-gray">já tem {ja} tarefa{ja > 1 ? "s" : ""} neste setor</span>}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={manterExternas} onChange={(e) => setManterExternas(e.target.checked)} disabled={copiando}
              className="mt-0.5 rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            <span className="text-xs text-torg-gray">
              <b>Manter as vinculações com tarefas de fora da área</b> (ex.: os recebimentos de Suprimentos). Desmarque para fazer todas as vinculações depois.
            </span>
          </label>
          {erro && <p className="text-xs text-red-600 flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {erro}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => onFechar?.()} disabled={copiando} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">Cancelar</button>
            <button onClick={copiar} disabled={copiando || !destinos.length}
              className="px-4 py-2 text-sm font-semibold text-white bg-torg-blue hover:bg-torg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
              {copiando ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
              {`Copiar para ${destinos.length} ${destinos.length === 1 ? "área" : "áreas"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
