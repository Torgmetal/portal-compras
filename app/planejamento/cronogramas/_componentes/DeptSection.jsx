"use client";
import { useState } from "react";
import { AlertCircle, ArrowUpDown, CheckCircle2, ChevronDown, ChevronRight, Factory, Loader2, Mail, X } from "lucide-react";
import { TarefaRow } from "./TarefaRow";
import { fmtData } from "../_lib/formatos";
import { DEPT_COLORS, DEPT_ICONS, DEPT_LABEL } from "../_lib/rotulos";
import { ModalCobranca } from "./ModalCobranca";
import { ListaTarefasDoSetor } from "./ListaTarefasDoSetor";

export function DeptSection({ dept, summary, tasks, now, onRefresh, cronogramaId, allTarefas, dataBase, tipoDias, areas, readOnly }) {
  const [collapsed, setCollapsed] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [cobrResult, setCobrResult] = useState(null);
  const [showCobrModal, setShowCobrModal] = useState(false);
  const [emailsSugeridos, setEmailsSugeridos] = useState([]);
  const [emailsSelecionados, setEmailsSelecionados] = useState([]);
  const [emailExtra, setEmailExtra] = useState("");
  // CC da direção — vem marcado e dá pra desmarcar (Vitor 19/08: "com opção de selecionar ou não")
  const [ccPadrao, setCcPadrao] = useState([]);
  const [ccSelecionado, setCcSelecionado] = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskInicio, setNewTaskInicio] = useState("");
  const [newTaskFim, setNewTaskFim] = useState("");
  const [newTaskDuracao, setNewTaskDuracao] = useState(0);
  const [newTaskAntecessoras, setNewTaskAntecessoras] = useState([]);
  const [newTaskArea, setNewTaskArea] = useState("");
  const [areasCollapsed, setAreasCollapsed] = useState(() => new Set());
  const [reordenando, setReordenando] = useState(false);
  const [ordemLocal, setOrdemLocal] = useState([]);
  const [salvandoOrdem, setSalvandoOrdem] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const Icon = DEPT_ICONS[dept] || Factory;
  const colors = DEPT_COLORS[dept] || "text-gray-600 bg-gray-50 border-gray-200";
  const atrasadas = tasks.filter((t) => !t.isSummary && t.dataFimPrevista && new Date(t.dataFimPrevista) < now && t.percentualRealizado < 100);

  // Agrupamento por Área dentro do setor (Setor → Área → Tarefa). Sem nenhuma
  // área definida, a lista sai plana (idêntico ao comportamento anterior).
  const mapaAreas = new Map();
  for (const t of tasks) {
    const k = t.area && t.area.trim() ? t.area.trim() : "";
    if (!mapaAreas.has(k)) mapaAreas.set(k, []);
    mapaAreas.get(k).push(t);
  }
  const gruposArea = [...mapaAreas.entries()];
  const temAreas = gruposArea.some(([a]) => a);
  // Sugestões dos datalists: áreas cadastradas no cronograma + as em uso nas tarefas.
  const areasExistentes = [...new Set([
    ...(Array.isArray(areas) ? areas.map((a) => a?.nome).filter(Boolean) : []),
    ...gruposArea.map(([a]) => a).filter(Boolean),
  ])];
  const toggleArea = (area) => setAreasCollapsed((s) => { const n = new Set(s); n.has(area) ? n.delete(area) : n.add(area); return n; });
  // Renomear preserva a COR (endpoint atualiza a lista de áreas + as tarefas de uma vez).
  const renomearArea = async (area) => {
    const novo = window.prompt(`Renomear área "${area}" para:`, area);
    if (novo == null) return;
    const nome = novo.trim();
    if (!nome || nome === area) return;
    try {
      await fetch(`/api/planejamento/cronogramas/${cronogramaId}/areas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "renomear", de: area, para: nome }),
      });
      onRefresh();
    } catch { /* ignora */ }
  };
  const addNaArea = (area) => { setNewTaskArea(area); setAddingTask(true); };
  const linhaTarefa = (t) => <TarefaRow key={t.id} tarefa={t} now={now} onRefresh={onRefresh} allTarefas={allTarefas} dataBase={dataBase} tipoDias={tipoDias} areas={areas} readOnly={readOnly} />;

  // Reordenar (staged): move client-side com ↑/↓ e só grava ao "Salvar ordem".
  const iniciarReordenar = () => { setOrdemLocal(tasks.filter((t) => !t.isSummary)); setReordenando(true); };
  const moverLocal = (idx, dir) => setOrdemLocal((arr) => {
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return arr;
    const n = arr.slice(); [n[idx], n[j]] = [n[j], n[idx]]; return n;
  });
  const salvarOrdem = async () => {
    setSalvandoOrdem(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/reordenar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordem: ordemLocal.map((t) => t.id) }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(`Erro ao salvar a ordem: ${e.error || "erro"}`); return; }
      setReordenando(false);
      onRefresh();
    } catch { alert("Erro de conexão ao salvar a ordem."); } finally { setSalvandoOrdem(false); }
  };

  const abrirModalCobranca = async (e) => {
    e.stopPropagation();
    setCobrResult(null);
    setShowCobrModal(true);
    setLoadingEmails(true);
    setEmailsSugeridos([]);
    setEmailsSelecionados([]);
    setEmailExtra("");
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/notificar-atrasos?departamento=${dept}`);
      const data = await res.json();
      if (data.success && data.sugeridos) {
        setEmailsSugeridos(data.sugeridos);
        setEmailsSelecionados(data.sugeridos.map((u) => u.email));
      }
      const cc = data.ccPadrao || [];
      setCcPadrao(cc);
      setCcSelecionado(cc.map((c) => c.email)); // marcados por padrão
    } catch { /* ignora */ }
    setLoadingEmails(false);
  };

  const toggleEmail = (email) => {
    setEmailsSelecionados((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const addEmailExtra = () => {
    const e = emailExtra.trim().toLowerCase();
    if (e && e.includes("@") && !emailsSelecionados.includes(e)) {
      setEmailsSelecionados((prev) => [...prev, e]);
      setEmailExtra("");
    }
  };

  const enviarCobranca = async () => {
    if (emailsSelecionados.length === 0) {
      alert("Selecione pelo menos um destinatário.");
      return;
    }
    setCobrando(true);
    setCobrResult(null);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/notificar-atrasos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `cc` sempre vai, mesmo vazio: [] significa "sem cópia", não "usa o padrão"
        body: JSON.stringify({ departamento: dept, emails: emailsSelecionados, cc: ccSelecionado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao notificar");
      const r = data.resultados?.[0];
      setCobrResult(r?.enviado
        ? { ok: true, msg: `Enviado para ${r.emails?.join(", ") || r.destinatarios + " pessoa(s)"}` }
        : { ok: false, msg: r?.motivo || data.motivo || "Não enviado" });
      setShowCobrModal(false);
    } catch (err) {
      setCobrResult({ ok: false, msg: err.message });
    } finally {
      setCobrando(false);
    }
  };

  return (
    <>
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 flex-1 min-w-0">
          {collapsed ? <ChevronRight size={14} className="text-torg-gray" /> : <ChevronDown size={14} className="text-torg-gray" />}
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1 ${colors}`}>
            <Icon size={12} /> {DEPT_LABEL[dept] || dept}
          </span>
          {summary && (
            <span className="text-xs text-torg-gray">
              {fmtData(summary.dataInicioPrevista)} — {fmtData(summary.dataFimPrevista)}
            </span>
          )}
          {atrasadas.length > 0 && (
            <span className="text-[10px] text-red-600 font-semibold">{atrasadas.length} atrasada{atrasadas.length > 1 ? "s" : ""}</span>
          )}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {!readOnly && atrasadas.length > 0 && (
            <button
              onClick={abrirModalCobranca}
              disabled={cobrando}
              className="px-2.5 py-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1 disabled:opacity-50 transition-colors"
              title={`Cobrar ${DEPT_LABEL[dept] || dept} por e-mail`}
            >
              {cobrando ? <Loader2 size={10} className="animate-spin" /> : <Mail size={10} />}
              Cobrar
            </button>
          )}
          {!readOnly && !reordenando && tasks.filter((t) => !t.isSummary).length >= 2 && (
            <button
              onClick={iniciarReordenar}
              className="px-2 py-1 text-[10px] font-medium text-torg-blue bg-torg-blue-50 border border-torg-blue-100 rounded-lg hover:bg-torg-blue-100 flex items-center gap-1"
              title="Reordenar as tarefas deste setor (mover com ↑ ↓ e salvar)"
            >
              <ArrowUpDown size={10} /> Reordenar
            </button>
          )}
          {summary && (
            <span className={`text-xs font-bold ${summary.percentualRealizado >= 100 ? "text-emerald-600" : summary.percentualRealizado > 0 ? "text-torg-blue" : "text-torg-gray"}`}>
              {summary.percentualRealizado}%
            </span>
          )}
        </div>
      </div>

      {cobrResult && (
        <div className={`ml-6 mb-2 px-3 py-1.5 rounded-lg text-[10px] flex items-center gap-1.5 ${cobrResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {cobrResult.ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
          {cobrResult.msg}
          <button onClick={() => setCobrResult(null)} className="ml-auto p-0.5 hover:opacity-70"><X size={10} /></button>
        </div>
      )}

      {!collapsed && (
        <ListaTarefasDoSetor
          addNaArea={addNaArea}
          addingTask={addingTask}
          adicionarTarefa={adicionarTarefa}
          allTarefas={allTarefas}
          areas={areas}
          areasCollapsed={areasCollapsed}
          areasExistentes={areasExistentes}
          dept={dept}
          gruposArea={gruposArea}
          linhaTarefa={linhaTarefa}
          moverLocal={moverLocal}
          newTaskAntecessoras={newTaskAntecessoras}
          newTaskArea={newTaskArea}
          newTaskDuracao={newTaskDuracao}
          newTaskFim={newTaskFim}
          newTaskInicio={newTaskInicio}
          newTaskName={newTaskName}
          ordemLocal={ordemLocal}
          readOnly={readOnly}
          renomearArea={renomearArea}
          reordenando={reordenando}
          salvandoOrdem={salvandoOrdem}
          salvarOrdem={salvarOrdem}
          savingTask={savingTask}
          setAddingTask={setAddingTask}
          setNewTaskAntecessoras={setNewTaskAntecessoras}
          setNewTaskArea={setNewTaskArea}
          setNewTaskDuracao={setNewTaskDuracao}
          setNewTaskFim={setNewTaskFim}
          setNewTaskInicio={setNewTaskInicio}
          setNewTaskName={setNewTaskName}
          setReordenando={setReordenando}
          tasks={tasks}
          temAreas={temAreas}
          tipoDias={tipoDias}
          toggleArea={toggleArea}
        />
      )}
    </div>

    {/* Modal de cobranca — fora do div com overflow-hidden */}
    {showCobrModal && (
      <ModalCobranca
        addEmailExtra={addEmailExtra}
        atrasadas={atrasadas}
        ccPadrao={ccPadrao}
        ccSelecionado={ccSelecionado}
        cobrando={cobrando}
        dept={dept}
        emailExtra={emailExtra}
        emailsSelecionados={emailsSelecionados}
        emailsSugeridos={emailsSugeridos}
        enviarCobranca={enviarCobranca}
        loadingEmails={loadingEmails}
        setCcSelecionado={setCcSelecionado}
        setEmailExtra={setEmailExtra}
        setShowCobrModal={setShowCobrModal}
        toggleEmail={toggleEmail}
      />
    )}
    </>
  );

  async function adicionarTarefa() {
    if (!newTaskName.trim()) return;
    setSavingTask(true);
    try {
      const body = {
        nome: newTaskName.trim(),
        departamento: dept,
        outlineLevel: 2,
        isSummary: false,
      };
      if (newTaskInicio) body.dataInicioPrevista = new Date(newTaskInicio + "T12:00:00Z").toISOString();
      if (newTaskFim) body.dataFimPrevista = new Date(newTaskFim + "T12:00:00Z").toISOString();
      if (newTaskDuracao > 0) body.duracaoDias = newTaskDuracao;
      if (newTaskArea.trim()) body.area = newTaskArea.trim();
      if (newTaskAntecessoras.length > 0) body.antecessoraIds = newTaskAntecessoras;

      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/tarefas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao adicionar");
      setAddingTask(false);
      setNewTaskName("");
      setNewTaskInicio("");
      setNewTaskFim("");
      setNewTaskDuracao(0);
      setNewTaskAntecessoras([]);
      setNewTaskArea("");
      onRefresh();
    } catch {
      // keep form open
    } finally {
      setSavingTask(false);
    }
  }
}
