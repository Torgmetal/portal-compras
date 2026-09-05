"use client";
import { useState } from "react";
import { Send, Weight, X } from "lucide-react";
import { fmtKg } from "../_lib/formatos";
import { FormularioTarefa } from "./FormularioTarefa";
import { AcoesDaTarefa } from "./AcoesDaTarefa";
import { TituloDaTarefa } from "./TituloDaTarefa";

export function TarefaRow({ tarefa, now, onRefresh, allTarefas, dataBase, tipoDias, areas, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [editNome, setEditNome] = useState(tarefa.nome);
  const [editArea, setEditArea] = useState(tarefa.area || "");
  const [pct, setPct] = useState(tarefa.percentualRealizado);
  const [obs, setObs] = useState(tarefa.observacao || "");
  const [dataExec, setDataExec] = useState(tarefa.dataRealizacao ? new Date(tarefa.dataRealizacao).toISOString().split("T")[0] : "");
  const [inicioReal, setInicioReal] = useState(tarefa.dataInicioReal ? new Date(tarefa.dataInicioReal).toISOString().split("T")[0] : "");
  const [fimReal, setFimReal] = useState(tarefa.dataFimReal ? new Date(tarefa.dataFimReal).toISOString().split("T")[0] : "");
  const [justificativa, setJustificativa] = useState("");
  const [pesoPlan, setPesoPlan] = useState(tarefa.qtdePlanejada || 0);
  const [pesoReal, setPesoReal] = useState(tarefa.qtdeRealizada || 0);
  const [antecessoraIds, setAntecessoraIds] = useState(tarefa.antecessoraIds || []);
  const [dataLib, setDataLib] = useState(tarefa.dataLiberacao ? new Date(tarefa.dataLiberacao).toISOString().split("T")[0] : "");
  const [motivoBlq, setMotivoBlq] = useState(tarefa.motivoBloqueio || "");
  const [editInicio, setEditInicio] = useState(tarefa.dataInicioPrevista ? new Date(tarefa.dataInicioPrevista).toISOString().split("T")[0] : "");
  const [editFim, setEditFim] = useState(tarefa.dataFimPrevista ? new Date(tarefa.dataFimPrevista).toISOString().split("T")[0] : "");
  const [duracaoDias, setDuracaoDias] = useState(tarefa.duracaoDias || 0);
  const [saving, setSaving] = useState(false);
  const [showReg, setShowReg] = useState(false);
  const [regText, setRegText] = useState("");
  const [sendingReg, setSendingReg] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Peso → % automático: ao preencher/alterar o peso planejado ou realizado, a
  // % concluída é recalculada (realizado ÷ planejado). Sem peso planejado a %
  // continua manual. O `pct` recalculado é o que vai no salvar.
  const recalcPctPeso = (plan, real) => {
    if (plan > 0) setPct(Math.min(100, Math.max(0, Math.round((real / plan) * 100))));
  };

  // Detecta se datas previstas foram alteradas em relação ao original
  const inicioOriginal = tarefa.dataInicioPrevista ? new Date(tarefa.dataInicioPrevista).toISOString().split("T")[0] : "";
  const fimOriginal = tarefa.dataFimPrevista ? new Date(tarefa.dataFimPrevista).toISOString().split("T")[0] : "";
  const datasMudaram = editInicio !== inicioOriginal || editFim !== fimOriginal;
  const cronogramaValidado = !!dataBase;
  const exigeJustificativa = cronogramaValidado && datasMudaram;

  const t = tarefa;
  const atrasada = t.dataFimPrevista && new Date(t.dataFimPrevista) < now && t.percentualRealizado < 100;
  const concluida = t.percentualRealizado >= 100;
  const indent = Math.max(0, t.outlineLevel - 2);

  // Atraso REAL vs fim previsto (a data base do cronograma NÃO muda):
  // concluída → término real (ou data executada) vs previsto; em andamento → hoje vs previsto.
  const fimPrev = t.dataFimPrevista ? new Date(t.dataFimPrevista) : null;
  const fimEfetivo = t.dataFimReal
    ? new Date(t.dataFimReal)
    : (concluida ? (t.dataRealizacao ? new Date(t.dataRealizacao) : null) : now);
  const atrasoDias = fimPrev && fimEfetivo && fimEfetivo > fimPrev
    ? Math.ceil((fimEfetivo - fimPrev) / 86400000)
    : 0;

  // Verifica se esta tarefa esta bloqueada (tem antecessora nao concluida)
  const antecessorasIncompletas = (t.antecessoraIds || []).filter((aid) => {
    const ant = (allTarefas || []).find((x) => x.id === aid);
    return ant && ant.percentualRealizado < 100;
  });
  const bloqueada = antecessorasIncompletas.length > 0 && !concluida;

  const salvar = async () => {
    // Validação local: justificativa obrigatória quando cronograma validado e datas mudaram
    if (exigeJustificativa && !justificativa.trim()) {
      alert("Justificativa obrigatória para alterar datas após validação do cronograma.");
      return;
    }
    // Tarefa bloqueada por antecessoras pendentes: avisa antes de registrar progresso
    if (bloqueada && (pct > t.percentualRealizado || inicioReal)) {
      const nomes = antecessorasIncompletas.map((aid) => (allTarefas || []).find((x) => x.id === aid)?.nome || "?").join(", ");
      if (!confirm(`⚠ Esta atividade está BLOQUEADA — aguardando: ${nomes}.\n\nRegistrar progresso/início mesmo assim?`)) return;
    }
    setSaving(true);
    try {
      const body = {
        percentualRealizado: pct,
        observacao: obs || null,
        dataRealizacao: dataExec ? new Date(dataExec + "T12:00:00Z").toISOString() : null,
        // Execução real — NÃO altera previsto/base; o atraso é derivado
        dataInicioReal: inicioReal ? new Date(inicioReal + "T12:00:00Z").toISOString() : null,
        dataFimReal: fimReal ? new Date(fimReal + "T12:00:00Z").toISOString() : null,
      };
      if (editNome !== t.nome) body.nome = editNome;
      { const areaNova = editArea.trim() || null; if (areaNova !== (t.area || null)) body.area = areaNova; }
      if (justificativa.trim()) body.justificativa = justificativa.trim();
      if (pesoPlan !== t.qtdePlanejada) body.qtdePlanejada = pesoPlan;
      if (pesoReal !== t.qtdeRealizada) body.qtdeRealizada = pesoReal;
      if (duracaoDias !== (t.duracaoDias || 0)) body.duracaoDias = duracaoDias;
      // Datas previstas — envia se mudou
      if (editInicio !== inicioOriginal) {
        body.dataInicioPrevista = editInicio ? new Date(editInicio + "T12:00:00Z").toISOString() : null;
      }
      if (editFim !== fimOriginal) {
        body.dataFimPrevista = editFim ? new Date(editFim + "T12:00:00Z").toISOString() : null;
      }
      // Antecessoras — sempre envia pra garantir persistencia
      body.antecessoraIds = antecessoraIds;
      // Liberação e motivo de bloqueio
      body.dataLiberacao = dataLib ? new Date(dataLib + "T12:00:00Z").toISOString() : null;
      body.motivoBloqueio = motivoBlq || null;
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Erro ao salvar: ${err.error || "Erro desconhecido"}`);
        return;
      }
      setEditing(false);
      setJustificativa("");
      onRefresh();
    } catch {
      alert("Erro de conexão ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const enviarRegistro = async () => {
    if (!regText.trim()) return;
    setSendingReg(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}/registros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: regText.trim() }),
      });
      if (!res.ok) throw new Error("Erro");
      setRegText("");
      setShowReg(false);
      onRefresh();
    } catch {
      // keep open
    } finally {
      setSendingReg(false);
    }
  };

  const excluirTarefa = async () => {
    if (!confirm(`Excluir a tarefa "${t.nome}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      onRefresh();
    } catch {
      // keep row
    } finally {
      setDeleting(false);
    }
  };

  const cancelarEdicao = () => {
    setEditing(false);
    setEditNome(t.nome);
    setPct(t.percentualRealizado);
    setObs(t.observacao || "");
    setDataExec(t.dataRealizacao ? new Date(t.dataRealizacao).toISOString().split("T")[0] : "");
    setInicioReal(t.dataInicioReal ? new Date(t.dataInicioReal).toISOString().split("T")[0] : "");
    setFimReal(t.dataFimReal ? new Date(t.dataFimReal).toISOString().split("T")[0] : "");
    setJustificativa("");
    setPesoPlan(t.qtdePlanejada || 0);
    setPesoReal(t.qtdeRealizada || 0);
    setAntecessoraIds(t.antecessoraIds || []);
    setDataLib(t.dataLiberacao ? new Date(t.dataLiberacao).toISOString().split("T")[0] : "");
    setMotivoBlq(t.motivoBloqueio || "");
    setEditInicio(t.dataInicioPrevista ? new Date(t.dataInicioPrevista).toISOString().split("T")[0] : "");
    setEditFim(t.dataFimPrevista ? new Date(t.dataFimPrevista).toISOString().split("T")[0] : "");
    setDuracaoDias(t.duracaoDias || 0);
  };

  return (
    <div className={`group rounded-lg border ${bloqueada ? "border-amber-200 bg-amber-50/20" : atrasada ? "border-red-200 bg-red-50/30" : "border-gray-100 bg-white"} p-2.5`} style={{ marginLeft: `${indent * 16}px` }}>
      <div className="flex items-center justify-between gap-2">
        <TituloDaTarefa
          allTarefas={allTarefas}
          antecessorasIncompletas={antecessorasIncompletas}
          areas={areas}
          atrasada={atrasada}
          bloqueada={bloqueada}
          concluida={concluida}
          editArea={editArea}
          editNome={editNome}
          editing={editing}
          setEditArea={setEditArea}
          setEditNome={setEditNome}
          t={t}
        />

        <AcoesDaTarefa
          atrasada={atrasada}
          atrasoDias={atrasoDias}
          concluida={concluida}
          deleting={deleting}
          editing={editing}
          excluirTarefa={excluirTarefa}
          onRefresh={onRefresh}
          pct={pct}
          readOnly={readOnly}
          setEditing={setEditing}
          setPct={setPct}
          setShowReg={setShowReg}
          showReg={showReg}
          t={t}
          tipoDias={tipoDias}
        />
      </div>

      {!readOnly && editing && (
        <FormularioTarefa
          allTarefas={allTarefas}
          antecessoraIds={antecessoraIds}
          antecessorasIncompletas={antecessorasIncompletas}
          bloqueada={bloqueada}
          cancelarEdicao={cancelarEdicao}
          cronogramaValidado={cronogramaValidado}
          dataLib={dataLib}
          datasMudaram={datasMudaram}
          duracaoDias={duracaoDias}
          editArea={editArea}
          editFim={editFim}
          editInicio={editInicio}
          exigeJustificativa={exigeJustificativa}
          fimReal={fimReal}
          inicioReal={inicioReal}
          justificativa={justificativa}
          motivoBlq={motivoBlq}
          obs={obs}
          pesoPlan={pesoPlan}
          pesoReal={pesoReal}
          recalcPctPeso={recalcPctPeso}
          salvar={salvar}
          saving={saving}
          setAntecessoraIds={setAntecessoraIds}
          setDataExec={setDataExec}
          setDataLib={setDataLib}
          setDuracaoDias={setDuracaoDias}
          setEditFim={setEditFim}
          setEditInicio={setEditInicio}
          setFimReal={setFimReal}
          setInicioReal={setInicioReal}
          setJustificativa={setJustificativa}
          setMotivoBlq={setMotivoBlq}
          setObs={setObs}
          setPesoPlan={setPesoPlan}
          setPesoReal={setPesoReal}
          t={t}
          tipoDias={tipoDias}
        />
      )}

      {t.observacao && !editing && (
        <p className="text-[10px] text-torg-gray mt-1 ml-5 italic">{t.observacao}</p>
      )}

      {showReg && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={regText}
            onChange={(e) => setRegText(e.target.value)}
            placeholder="O que aconteceu..."
            className="flex-1 text-[10px] px-2 py-1 border border-gray-200 rounded"
            onKeyDown={(e) => e.key === "Enter" && enviarRegistro()}
          />
          <button onClick={enviarRegistro} disabled={sendingReg || !regText.trim()} className="p-1 text-torg-blue hover:text-torg-blue-700 disabled:opacity-50">
            <Send size={12} />
          </button>
          <button onClick={() => { setShowReg(false); setRegText(""); }} className="p-1 text-torg-gray hover:text-torg-dark">
            <X size={12} />
          </button>
        </div>
      )}

      {t.registros?.length > 0 && (
        <div className="mt-1.5 ml-5 space-y-0.5">
          {t.registros.map((r) => (
            <p key={r.id} className="text-[9px] text-torg-gray">
              <span className="font-medium">{r.createdBy?.name}</span>{" "}
              <span className="opacity-70">({new Date(r.createdAt).toLocaleDateString("pt-BR")})</span>:{" "}
              {r.descricao}
            </p>
          ))}
        </div>
      )}

      {t.qtdePlanejada > 0 && (
        <div className="mt-1.5 ml-5 flex items-center gap-2">
          <Weight size={10} className="text-torg-gray shrink-0" />
          <div className="flex-1 max-w-[200px]">
            <div className="flex items-center justify-between text-[9px] text-torg-gray mb-0.5">
              <span>{fmtKg(t.qtdeRealizada)} / {fmtKg(t.qtdePlanejada)}</span>
              <span className="font-bold">{t.qtdePlanejada > 0 ? Math.min(100, Math.round(t.qtdeRealizada / t.qtdePlanejada * 100)) : 0}%</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full"
                style={{ width: `${Math.min(100, t.qtdePlanejada > 0 ? (t.qtdeRealizada / t.qtdePlanejada * 100) : 0)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
