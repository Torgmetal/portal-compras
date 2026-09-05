"use client";
import { useState } from "react";
import GanttInline from "@/components/planejamento/GanttInline";
import { Plus } from "lucide-react";
import { DeptSection } from "./DeptSection";
import { GestorAreas } from "./GestorAreas";
import { ImportarPesoModal } from "./ImportarPesoModal";
import { DEPT_LABEL, DEPT_ORDER } from "../_lib/rotulos";
import { ModalCopiarCronograma } from "./ModalCopiarCronograma";
import { ModalGerarDatas } from "./ModalGerarDatas";
import { BarraControlesCronograma } from "./BarraControlesCronograma";
import { EstadoVazioCronograma } from "./EstadoVazioCronograma";
import { AvisoRecalculo } from "./AvisoRecalculo";
import { useCopiarCronograma } from "../_hooks/useCopiarCronograma";

export function CronogramaDetail({ detail, onRefresh, cronogramaId, readOnly }) {
  const [addingGlobal, setAddingGlobal] = useState(false);
  const [newDept, setNewDept] = useState("FABRICACAO");
  const [newName, setNewName] = useState("");
  const [newInicio, setNewInicio] = useState("");
  const [newFim, setNewFim] = useState("");
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [showImportPeso, setShowImportPeso] = useState(false);
  const [viewMode, setViewMode] = useState("lista"); // "lista" | "gantt"
  const [recalculando, setRecalculando] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState(null);
  // Gerar datas automaticamente (a partir de início + duração + antecessoras)
  const [showGerar, setShowGerar] = useState(false);
  const [gerarInicio, setGerarInicio] = useState("");
  const [gerarPreview, setGerarPreview] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [encadearSetor, setEncadearSetor] = useState(true); // encadeia tarefas do mesmo setor em sequência
  // ⚠⚠ LIGADO POR PADRÃO. Gerar datas recalcula TUDO a partir do início do projeto — na OP-094 isso
  // preenchia as 6 tarefas de Fabricação e MUDAVA as 8 que já tinham data acordada (Recebimento dos
  // arquivos ia de 22/06→03/07 para 22/06→22/06). O caso comum é completar o que falta, não
  // refazer o cronograma; refazer é a exceção e agora exige desmarcar.
  const [apenasSemData, setApenasSemData] = useState(true);
  // Copiar cronograma pra outra OP (mesma estrutura, progresso zerado)
  const {
    showCopiar, setShowCopiar, copiarOp, copiarTitulo, setCopiarTitulo,
    copiarProgresso, setCopiarProgresso, copiando, copiarErro, copiarOps,
    loadingCopiarOps, isVitor, abrirCopiar, selecionarOpCopia, copiar,
  } = useCopiarCronograma({ cronogramaId, detail });

  const now = new Date();
  const tarefas = detail.tarefas || [];

  // Descobre se o usuário logado é o Vitor (só ele vê o "Copiar para OP" por enquanto).

  const recalcular = async () => {
    setRecalculando(true);
    setRecalcMsg(null);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/recalcular`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao recalcular");
      setRecalcMsg({ ok: true, msg: data.message });
      if (data.alteracoes > 0) onRefresh();
    } catch (e) {
      setRecalcMsg({ ok: false, msg: e.message });
    } finally {
      setRecalculando(false);
    }
  };

  const abrirGerar = () => {
    setGerarInicio(
      detail.dataInicio
        ? new Date(detail.dataInicio).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
    setGerarPreview(null);
    setRecalcMsg(null);
    setShowGerar(true);
  };

  const gerarDatas = async (aplicar) => {
    setGerando(true);
    try {
      const body = { aplicar, encadearSetor, apenasSemData };
      if (gerarInicio) body.dataInicioProjeto = new Date(gerarInicio + "T12:00:00Z").toISOString();
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/gerar-datas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar datas");
      if (aplicar) {
        setShowGerar(false);
        setGerarPreview(null);
        setRecalcMsg({ ok: true, msg: `${data.aplicadas} tarefa${data.aplicadas > 1 ? "s" : ""} com datas geradas.` });
        onRefresh();
      } else {
        setGerarPreview(data.preview || []);
      }
    } catch (e) {
      if (aplicar) setRecalcMsg({ ok: false, msg: e.message });
      else setGerarPreview({ erro: e.message });
    } finally {
      setGerando(false);
    }
  };

  const byDept = {};

  for (const t of tarefas) {
    if (t.outlineLevel === 0 || !t.departamento) continue;
    if (!byDept[t.departamento]) byDept[t.departamento] = { summary: null, tasks: [] };
    if (t.outlineLevel === 1 && t.isSummary) {
      byDept[t.departamento].summary = t;
    } else {
      byDept[t.departamento].tasks.push(t);
    }
  }

  const hasTarefas = Object.keys(byDept).length > 0;

  const adicionarTarefaGlobal = async () => {
    if (!newName.trim()) return;
    setSavingGlobal(true);
    try {
      const body = { nome: newName.trim(), departamento: newDept, outlineLevel: 2, isSummary: false };
      if (newInicio) body.dataInicioPrevista = new Date(newInicio + "T12:00:00Z").toISOString();
      if (newFim) body.dataFimPrevista = new Date(newFim + "T12:00:00Z").toISOString();
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/tarefas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao adicionar");
      setNewName("");
      setNewInicio("");
      setNewFim("");
      onRefresh();
    } catch {
      // keep form open
    } finally {
      setSavingGlobal(false);
    }
  };

  // Verifica se alguma tarefa ja tem peso
  const temPeso = tarefas.some((t) => t.qtdePlanejada > 0);

  // Conta tarefas com antecessoras
  tarefas.some((t) => t.antecessoraIds?.length > 0);

  return (
    <div className="divide-y divide-gray-50">
      {/* Barra de controles: Peso + View toggle + Recalcular */}
      {hasTarefas && (
        <BarraControlesCronograma
          abrirCopiar={abrirCopiar}
          abrirGerar={abrirGerar}
          cronogramaId={cronogramaId}
          isVitor={isVitor}
          readOnly={readOnly}
          recalculando={recalculando}
          recalcular={recalcular}
          setShowImportPeso={setShowImportPeso}
          setViewMode={setViewMode}
          temPeso={temPeso}
          viewMode={viewMode}
        />
      )}

      {recalcMsg && (
        <AvisoRecalculo
          recalcMsg={recalcMsg}
          setRecalcMsg={setRecalcMsg}
        />
      )}

      {/* Modal: Gerar datas automaticamente (prévia + aplicar) */}
      {showGerar && (
        <ModalGerarDatas
          apenasSemData={apenasSemData}
          detail={detail}
          encadearSetor={encadearSetor}
          gerando={gerando}
          gerarDatas={gerarDatas}
          gerarInicio={gerarInicio}
          gerarPreview={gerarPreview}
          setApenasSemData={setApenasSemData}
          setEncadearSetor={setEncadearSetor}
          setGerarInicio={setGerarInicio}
          setGerarPreview={setGerarPreview}
          setShowGerar={setShowGerar}
        />
      )}

      {hasTarefas && <GestorAreas cronogramaId={cronogramaId} areas={detail.areas} tarefas={tarefas} onRefresh={onRefresh} readOnly={readOnly} />}

      {viewMode === "gantt" && hasTarefas ? (
        <GanttInline tarefas={tarefas} detail={detail} />
      ) : (
        <>
          {DEPT_ORDER.filter((d) => byDept[d]).map((dept) => {
            const { summary, tasks } = byDept[dept];
            return <DeptSection key={dept} dept={dept} summary={summary} tasks={tasks} now={now} onRefresh={onRefresh} cronogramaId={cronogramaId} allTarefas={tarefas} dataBase={detail.dataBase} tipoDias={detail.tipoDias} areas={detail.areas} readOnly={readOnly} />;
          })}
          {/* Departamentos fora da ordem padrao (se houver) */}
          {Object.keys(byDept).filter((d) => !DEPT_ORDER.includes(d)).map((dept) => {
            const { summary, tasks } = byDept[dept];
            return <DeptSection key={dept} dept={dept} summary={summary} tasks={tasks} now={now} onRefresh={onRefresh} cronogramaId={cronogramaId} allTarefas={tarefas} dataBase={detail.dataBase} tipoDias={detail.tipoDias} areas={detail.areas} readOnly={readOnly} />;
          })}
        </>
      )}

      {!hasTarefas && !addingGlobal && (
        <EstadoVazioCronograma
          readOnly={readOnly}
          setAddingGlobal={setAddingGlobal}
        />
      )}

      {/* Botão global de adicionar tarefa (sempre visível quando já tem tarefas) */}
      {!readOnly && (
      <div className="px-4 py-3">
        {!addingGlobal ? (
          <button
            onClick={() => setAddingGlobal(true)}
            className="flex items-center gap-1.5 text-xs text-torg-blue hover:text-torg-blue-700 font-medium py-1"
          >
            <Plus size={13} /> Adicionar tarefa
          </button>
        ) : (
          <div className="rounded-lg border border-torg-blue/20 bg-torg-blue-50/20 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <select
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white"
              >
                {Object.entries(DEPT_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da tarefa..."
                className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded bg-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) adicionarTarefaGlobal();
                  if (e.key === "Escape") setAddingGlobal(false);
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-torg-gray">Início:</span>
                <input type="date" value={newInicio} onChange={(e) => setNewInicio(e.target.value)} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-torg-gray">Fim:</span>
                <input type="date" value={newFim} onChange={(e) => setNewFim(e.target.value)} className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white" />
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <button onClick={() => setAddingGlobal(false)} className="px-2 py-1 text-[10px] text-torg-gray hover:text-torg-dark">
                  Cancelar
                </button>
                <button
                  onClick={adicionarTarefaGlobal}
                  disabled={savingGlobal || !newName.trim()}
                  className="px-3 py-1 bg-torg-blue text-white text-[10px] rounded hover:bg-torg-blue-700 disabled:opacity-50 font-medium"
                >
                  {savingGlobal ? "..." : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {showImportPeso && (
        <ImportarPesoModal
          cronogramaId={cronogramaId}
          onClose={() => setShowImportPeso(false)}
          onImported={() => { setShowImportPeso(false); onRefresh(); }}
        />
      )}

      {showCopiar && (
        <ModalCopiarCronograma
          copiando={copiando}
          copiar={copiar}
          copiarErro={copiarErro}
          copiarOp={copiarOp}
          copiarOps={copiarOps}
          copiarProgresso={copiarProgresso}
          copiarTitulo={copiarTitulo}
          detail={detail}
          loadingCopiarOps={loadingCopiarOps}
          selecionarOpCopia={selecionarOpCopia}
          setCopiarProgresso={setCopiarProgresso}
          setCopiarTitulo={setCopiarTitulo}
          setShowCopiar={setShowCopiar}
        />
      )}
    </div>
  );
}
