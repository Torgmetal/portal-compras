"use client";
import { AlertTriangle, Calendar, CheckCircle2, Clock, Lock, Weight } from "lucide-react";
import { AntecessorasPicker } from "./AntecessorasPicker";
import { DEPT_LABEL } from "../_lib/rotulos";

// Formulario de edicao da tarefa: datas, peso, responsavel e antecessoras.
export function FormularioTarefa({
  allTarefas,
  antecessoraIds,
  antecessorasIncompletas,
  bloqueada,
  cancelarEdicao,
  cronogramaValidado,
  dataLib,
  datasMudaram,
  duracaoDias,
  editArea,
  editFim,
  editInicio,
  exigeJustificativa,
  fimReal,
  inicioReal,
  justificativa,
  motivoBlq,
  obs,
  pesoPlan,
  pesoReal,
  recalcPctPeso,
  salvar,
  saving,
  setAntecessoraIds,
  setDataExec,
  setDataLib,
  setDuracaoDias,
  setEditFim,
  setEditInicio,
  setFimReal,
  setInicioReal,
  setJustificativa,
  setMotivoBlq,
  setObs,
  setPesoPlan,
  setPesoReal,
  t,
  tipoDias,
}) {
  return (
    <div className="mt-2 space-y-2 bg-gray-50/50 rounded-lg p-2.5 border border-gray-100">
      {/* Aviso de bloqueio: as antecessoras pendentes impedem a execução */}
      {bloqueada && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-2">
          <p className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
            <Lock size={10} /> Esta atividade NÃO pode ser executada ainda — aguardando:
          </p>
          <ul className="mt-1 space-y-0.5">
            {antecessorasIncompletas.map((aid) => {
              const ant = (allTarefas || []).find((x) => x.id === aid);
              if (!ant) return null;
              return (
                <li key={aid} className="text-[10px] text-amber-800 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                  <span className="font-medium">{DEPT_LABEL[ant.departamento] || ant.departamento || "—"}:</span>
                  <span className="truncate">{ant.nome}</span>
                  <span className="text-amber-600 tabular-nums shrink-0">({Math.round(ant.percentualRealizado)}%)</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Observação..."
          className="flex-1 text-[10px] px-2 py-1 border border-gray-200 rounded bg-white"
        />
      </div>
      {/* Datas previstas */}
      <div className={`flex items-center gap-3 flex-wrap rounded-lg p-1.5 -mx-1.5 ${datasMudaram && cronogramaValidado ? "bg-amber-50 border border-amber-200" : ""}`}>
        <div className="flex items-center gap-1.5">
          <Calendar size={11} className={cronogramaValidado && datasMudaram ? "text-amber-500" : "text-torg-blue"} />
          <span className="text-[10px] text-torg-gray whitespace-nowrap font-medium">Início previsto:</span>
          <input
            type="date"
            value={editInicio}
            onChange={(e) => setEditInicio(e.target.value)}
            className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white"
          />
          {editInicio && (
            <button onClick={() => setEditInicio("")} className="text-[9px] text-red-400 hover:text-red-600">limpar</button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-torg-gray whitespace-nowrap font-medium">Fim previsto:</span>
          <input
            type="date"
            value={editFim}
            onChange={(e) => setEditFim(e.target.value)}
            className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white"
          />
          {editFim && (
            <button onClick={() => setEditFim("")} className="text-[9px] text-red-400 hover:text-red-600">limpar</button>
          )}
        </div>
        {datasMudaram && cronogramaValidado && (
          <span className="text-[9px] text-amber-600 font-semibold flex items-center gap-0.5">
            <AlertTriangle size={9} /> Datas alteradas — justificativa obrigatória
          </span>
        )}
        {datasMudaram && !cronogramaValidado && (
          <span className="text-[9px] text-torg-blue italic">
            Datas ajustadas livremente (cronograma não validado)
          </span>
        )}
      </div>
      {/* Duração em dias */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Clock size={11} className="text-torg-blue" />
          <span className="text-[10px] text-torg-gray whitespace-nowrap font-medium">Duração:</span>
          <input
            type="number"
            min={0}
            max={9999}
            value={duracaoDias || ""}
            onChange={(e) => setDuracaoDias(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-16 text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white text-center"
            placeholder="0"
          />
          <span className="text-[9px] text-torg-gray">{(tipoDias || "DU") === "DU" ? "dias úteis" : "dias corridos"}</span>
        </div>
        {duracaoDias > 0 && editInicio && (
          <span className="text-[9px] text-emerald-600 italic">
            Fim será calculado automaticamente ao recalcular
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Calendar size={11} className="text-emerald-600" />
          <span className="text-[10px] text-torg-gray whitespace-nowrap font-medium">Início real:</span>
          <input
            type="date"
            value={inicioReal}
            onChange={(e) => setInicioReal(e.target.value)}
            className="text-[10px] px-1.5 py-0.5 border border-emerald-200 rounded bg-white"
          />
          {inicioReal && (
            <button onClick={() => setInicioReal("")} className="text-[9px] text-red-400 hover:text-red-600">limpar</button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-torg-gray whitespace-nowrap font-medium">Término real:</span>
          <input
            type="date"
            value={fimReal}
            onChange={(e) => { setFimReal(e.target.value); setDataExec(e.target.value); }}
            className="text-[10px] px-1.5 py-0.5 border border-emerald-200 rounded bg-white"
          />
          {fimReal && (
            <button onClick={() => { setFimReal(""); setDataExec(""); }} className="text-[9px] text-red-400 hover:text-red-600">limpar</button>
          )}
        </div>
        {fimReal && editFim && fimReal > editFim && (
          <span className="text-[9px] text-white bg-red-500 px-1.5 py-0.5 rounded-full font-semibold">
            +{Math.ceil((new Date(fimReal + "T12:00:00") - new Date(editFim + "T12:00:00")) / 86400000)}d após o previsto
          </span>
        )}
        <span className="text-[9px] text-torg-gray italic">as datas previstas não mudam — o atraso fica registrado</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Weight size={11} className="text-torg-gray" />
          <span className="text-[10px] text-torg-gray whitespace-nowrap">Peso plan.:</span>
          <input
            type="number"
            min={0}
            step={100}
            value={pesoPlan || ""}
            onChange={(e) => { const v = parseFloat(e.target.value) || 0; setPesoPlan(v); recalcPctPeso(v, pesoReal); }}
            className="w-20 text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white text-right"
            placeholder="0"
          />
          <span className="text-[9px] text-torg-gray">kg</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-torg-gray whitespace-nowrap">Realizado:</span>
          <input
            type="number"
            min={0}
            step={100}
            value={pesoReal || ""}
            onChange={(e) => { const v = parseFloat(e.target.value) || 0; setPesoReal(v); recalcPctPeso(pesoPlan, v); }}
            className="w-20 text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white text-right"
            placeholder="0"
          />
          <span className="text-[9px] text-torg-gray">kg</span>
        </div>
        {pesoPlan > 0 && (
          <span className="text-[9px] text-torg-blue whitespace-nowrap" title="% concluída calculada pelo peso realizado ÷ planejado">
            = {Math.min(100, Math.max(0, Math.round((pesoReal / pesoPlan) * 100)))}% concluída
          </span>
        )}
      </div>
      {/* Antecessoras */}
      <AntecessorasPicker
        tarefaId={t.id}
        allTarefas={allTarefas}
        selecionadas={antecessoraIds}
        onChange={setAntecessoraIds}
        areaAtual={editArea}
      />
      {/* Bloqueio externo */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Lock size={11} className="text-amber-500" />
          <span className="text-[10px] text-torg-gray font-medium">Bloqueio externo:</span>
        </div>

        {motivoBlq && !dataLib ? (
          /* ── Estado: Bloqueado, aguardando liberação ── */
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <Lock size={12} className="text-red-500 shrink-0" />
              <span className="text-[10px] text-red-700 font-semibold">Bloqueado — aguardando liberação</span>
            </div>
            <input
              value={motivoBlq}
              onChange={(e) => setMotivoBlq(e.target.value)}
              className="w-full text-[10px] px-2 py-1 border border-red-200 rounded bg-white text-red-700"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const hoje = new Date().toISOString().split("T")[0];
                  setDataLib(hoje);
                }}
                className="px-3 py-1 text-[10px] font-semibold text-white bg-emerald-600 rounded hover:bg-emerald-700 flex items-center gap-1"
              >
                <CheckCircle2 size={10} /> Liberar agora (data de hoje)
              </button>
              <button
                onClick={() => { setMotivoBlq(""); setDataLib(""); }}
                className="px-2 py-1 text-[10px] text-torg-gray hover:text-red-500"
              >
                Remover bloqueio
              </button>
            </div>
            <p className="text-[9px] text-red-600/70 italic">
              Tarefas que dependem desta estão pausadas até a liberação. Ao liberar, o sistema recalculará as datas automaticamente.
            </p>
          </div>
        ) : dataLib ? (
          /* ── Estado: Já liberado ── */
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
              <span className="text-[10px] text-emerald-700 font-semibold">
                Liberado em {new Date(dataLib + "T12:00:00Z").toLocaleDateString("pt-BR")}
              </span>
              {motivoBlq && <span className="text-[9px] text-torg-gray">({motivoBlq})</span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-torg-gray whitespace-nowrap">Alterar data:</span>
                <input
                  type="date"
                  value={dataLib}
                  onChange={(e) => setDataLib(e.target.value)}
                  className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white"
                />
              </div>
              <button
                onClick={() => { setDataLib(""); setMotivoBlq(""); }}
                className="text-[9px] text-red-400 hover:text-red-600"
              >
                Limpar
              </button>
            </div>
          </div>
        ) : (
          /* ── Estado: Sem bloqueio ── */
          <div className="flex items-center gap-2">
            <input
              value={motivoBlq}
              onChange={(e) => setMotivoBlq(e.target.value)}
              placeholder="Ex: aguardando aprovação do cliente, aditivo pendente..."
              className="flex-1 min-w-[180px] text-[10px] px-2 py-1 border border-gray-200 rounded bg-white"
            />
            {motivoBlq.trim() && (
              <span className="text-[9px] text-amber-600 italic whitespace-nowrap">
                Ao salvar, tarefa será bloqueada
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder={exigeJustificativa ? "⚠ Justificativa obrigatória — explique o motivo da alteração de datas..." : "Justificativa / motivo da alteração (opcional)..."}
          className={`flex-1 text-[10px] px-2 py-1 border rounded bg-white ${exigeJustificativa ? (justificativa.trim() ? "border-emerald-300" : "border-amber-400 ring-1 ring-amber-200") : "border-gray-200"}`}
          onKeyDown={(e) => e.key === "Enter" && salvar()}
        />
        {exigeJustificativa && !justificativa.trim() && (
          <span className="text-[9px] text-red-500 font-semibold whitespace-nowrap">Obrigatório</span>
        )}
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={cancelarEdicao} className="px-2 py-1 text-[10px] text-torg-gray hover:text-torg-dark">
          Cancelar
        </button>
        <button onClick={salvar} disabled={saving || (exigeJustificativa && !justificativa.trim())} className="px-3 py-1 bg-torg-blue text-white text-[10px] rounded hover:bg-torg-blue-700 disabled:opacity-50 font-medium">
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
