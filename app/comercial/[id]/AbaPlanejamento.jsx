"use client";
import { useState, useEffect } from "react";
import { GanttChart, Loader2, CheckCircle2, Clock, CalendarRange } from "lucide-react";
import GanttInline from "@/components/planejamento/GanttInline";
import AtasOPSection from "./AtasOPSection";
import ResumoLotes from "./ResumoLotes";
import ConsultaExpedicao from "./ConsultaExpedicao";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function AbaPlanejamento({ opId, localObra }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [cgIdx, setCgIdx] = useState(0);

  const carregar = () => fetch(`/api/comercial/op/${opId}/planejamento`).then((r) => r.json())
    .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro ao carregar"); })
    .catch(() => setErro("Não foi possível carregar."));

  useEffect(() => {
    setLoading(true); setErro("");
    carregar().finally(() => setLoading(false));
  }, [opId]);

  if (loading) return <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>;
  if (erro) return <div className="py-16 text-center text-red-600 text-sm">{erro}</div>;

  const cronogramas = dados?.cronogramas || [];
  const cg = cronogramas[cgIdx] || cronogramas[0];
  const tarefas = dados?.tarefas || [];
  const andamento = tarefas.filter((t) => t.status === "EM_ANDAMENTO");
  const concluidas = tarefas.filter((t) => t.status === "CONCLUIDA");
  const lotes = dados?.lotes || [];

  return (
    <div className="space-y-5">
      {/* Cronograma (Gantt) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5"><GanttChart size={15} className="text-torg-blue" /> Cronograma <span className="text-torg-gray font-normal">· Gantt</span></h3>
          {cronogramas.length > 1 && (
            <select value={cgIdx} onChange={(e) => setCgIdx(Number(e.target.value))} className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white">
              {cronogramas.map((c, i) => <option key={c.id} value={i}>{c.titulo}</option>)}
            </select>
          )}
        </div>
        {cg ? <GanttInline tarefas={cg.tarefas} /> : (
          <p className="text-sm text-torg-gray py-8 text-center">Nenhum cronograma para esta OP ainda — crie no módulo Planejamento.</p>
        )}
      </div>

      {/* Lotes de entrega: lista do Tekla + data de entrega definida aqui */}
      <ResumoLotes opId={opId} lotes={lotes} onChange={carregar} />

      {/* Consulta da lista de expedição por peça (sem precisar exportar) */}
      <ConsultaExpedicao opId={opId} localObra={localObra} />

      {/* Histórico de tarefas */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5 mb-3"><CalendarRange size={15} className="text-torg-blue" /> Histórico de tarefas <span className="text-torg-gray font-normal">· em andamento e concluídas</span></h3>
        {tarefas.length === 0 ? (
          <p className="text-sm text-torg-gray py-8 text-center">Nenhuma tarefa de planejamento (em andamento ou concluída) desta OP ainda.</p>
        ) : (
          <div className="space-y-4">
            {andamento.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1"><Clock size={12} /> Em andamento ({andamento.length})</p>
                <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg">{andamento.map((t) => <TarefaRow key={t.id} t={t} />)}</div>
              </div>
            )}
            {concluidas.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1.5 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Concluídas ({concluidas.length})</p>
                <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg">{concluidas.map((t) => <TarefaRow key={t.id} t={t} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Atas de reunião da OP — numeração por OP, preenchimento por IA, envio ao cliente p/ aceite */}
      <AtasOPSection opId={opId} />
    </div>
  );
}

function TarefaRow({ t }) {
  const done = t.status === "CONCLUIDA";
  return (
    <div className="px-3 py-2 flex items-start justify-between gap-3 text-[13px] hover:bg-gray-50/40">
      <div className="min-w-0">
        <p className={`font-medium ${done ? "text-torg-gray line-through" : "text-torg-dark"}`}>{t.titulo}</p>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-torg-gray mt-0.5">
          {t.setor && <span className="px-1.5 py-0.5 rounded bg-gray-100">{t.setor}</span>}
          {t.responsavel && <span>Resp.: {t.responsavel}</span>}
          <span>semana {t.semanaIso}/{t.ano}</span>
        </div>
      </div>
      <span className="text-[11px] text-torg-gray shrink-0 whitespace-nowrap">{done ? `concluída ${fmtD(t.dataConcluida)}` : (t.dataPrevista ? `prazo ${fmtD(t.dataPrevista)}` : "—")}</span>
    </div>
  );
}
