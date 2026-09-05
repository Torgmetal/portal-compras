"use client";
import { useState } from "react";
import ModalEnviarCronograma from "@/components/planejamento/ModalEnviarCronograma";
import { Archive, Calendar, FileDown, GanttChart, History, Loader2, Milestone, Package, Send, Trash2, Weight } from "lucide-react";
import { CronogramaDetail } from "./CronogramaDetail";
import { HistoricoTab } from "./HistoricoTab";
import { ProducaoTab } from "./ProducaoTab";
import { SuprimentosTab } from "./SuprimentosTab";

export function CronogramaExpandido({ detail, loadingDetail, onRefreshDetail, cronogramaId, onDeleted, onEncerrado, opStatus, readOnly }) {
  const [tab, setTab] = useState("cronograma");
  const [settingBase, setSettingBase] = useState(false);
  const [enviandoTarefas, setEnviandoTarefas] = useState(false);

  // ENVIAR TAREFAS PROS SETORES — ato deliberado, depois que o cronograma está fechado.
  // Vitor (19/08/2026): "não deve ser preenchido automático, pois algumas estruturas mudam de obra
  // para obra". Enquanto não é enviado, as linhas são rascunho e não aparecem na Sequência de
  // ninguém. Recolher devolve pro rascunho — melhor sumir do que deixar o setor seguindo data que
  // já não vale.
  const enviarTarefas = async (recolher = false) => {
    if (recolher && !window.confirm("Recolher as tarefas?\n\nElas somem da Sequência dos setores até serem enviadas de novo.")) return;
    if (!recolher && !window.confirm("Enviar as tarefas deste cronograma aos setores?\n\nElas passam a aparecer na aba Sequência de cada setor.")) return;
    setEnviandoTarefas(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${detail.id}/enviar-tarefas`, { method: recolher ? "DELETE" : "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (!recolher) {
        const setores = Object.entries(j.porSetor || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
        alert(`${j.tarefas} tarefa(s) enviada(s).\n${setores}` + (j.semData ? `\n\n${j.semData} sem data ficaram de fora.` : ""));
      }
      onRefreshDetail?.(cronogramaId);
    } catch (e) {
      alert(`Não consegui: ${e.message}`);
    } finally {
      setEnviandoTarefas(false);
    }
  };
  const [deleting, setDeleting] = useState(false);
  const [savingTipoDias, setSavingTipoDias] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [modalEnviar, setModalEnviar] = useState(false);

  const definirDataBase = async () => {
    const hoje = new Date().toISOString().split("T")[0];
    const input = prompt("Data base do cronograma (AAAA-MM-DD):", hoje);
    if (!input) return;
    const d = new Date(input + "T12:00:00Z");
    if (isNaN(d.getTime())) return alert("Data inválida");
    setSettingBase(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase: d.toISOString() }),
      });
      if (!res.ok) throw new Error("Erro ao definir data base");
      onRefreshDetail();
    } catch (e) {
      alert(e.message);
    } finally {
      setSettingBase(false);
    }
  };

  const alterarTipoDias = async (novoTipo) => {
    setSavingTipoDias(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoDias: novoTipo }),
      });
      if (!res.ok) throw new Error("Erro ao alterar tipo de dias");
      onRefreshDetail();
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingTipoDias(false);
    }
  };

  const excluirCronograma = async () => {
    if (!confirm("Tem certeza que deseja excluir este cronograma? Todas as tarefas e registros serão perdidos.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao excluir");
      }
      onDeleted();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const encerrarCronograma = async () => {
    if (!confirm("Encerrar este cronograma? Ele será movido para o histórico e poderá ser consultado ou reaberto a qualquer momento.")) return;
    setEncerrando(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao encerrar");
      }
      if (onEncerrado) onEncerrado();
    } catch (e) {
      alert(e.message);
    } finally {
      setEncerrando(false);
    }
  };

  const opFinalizada = opStatus === "ENCERRADA" || opStatus === "CANCELADA";

  const tabs = [
    { key: "cronograma", label: "Cronograma", icon: GanttChart },
    { key: "producao", label: "Produção / Peso", icon: Weight },
    { key: "suprimentos", label: "RMs / Pedidos / NFs", icon: Package },
    { key: "historico", label: "Linha de Controle", icon: History },
  ];

  return (
    <div className="border-t border-gray-100">
      {/* Data Base badge + ações */}
      {detail && (
        <div className={`px-4 py-2 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2 ${readOnly ? "bg-gray-100/70" : "bg-gray-50/60"}`}>
          <div className="flex items-center gap-3">
            {readOnly && (
              <span className="text-[9px] bg-gray-200 text-torg-gray px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                <Archive size={9} /> Somente consulta
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <Milestone size={13} className="text-torg-blue" />
              <span className="text-xs font-medium text-torg-dark">Data Base:</span>
              {detail.dataBase ? (
                <span className="text-xs font-bold text-torg-blue">{new Date(detail.dataBase).toLocaleDateString("pt-BR")}</span>
              ) : (
                <span className="text-xs text-torg-gray italic">Não definida</span>
              )}
            </div>
            {!readOnly && (
              <button
                onClick={definirDataBase}
                disabled={settingBase}
                className="px-2 py-0.5 text-[10px] font-medium text-torg-blue bg-torg-blue-50 border border-torg-blue/20 rounded hover:bg-torg-blue-100 disabled:opacity-50"
              >
                {settingBase ? "..." : detail.dataBase ? "Redefinir" : "Definir"}
              </button>
            )}
            {detail.dataBase && (
              <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                Datas do cronograma travadas
              </span>
            )}
            {/* Libera as tarefas pros setores — só depois que o cronograma está fechado. */}
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-200">
              <Send size={12} className={detail.tarefasEnviadasEm ? "text-green-600" : "text-torg-gray"} />
              <span className="text-xs font-medium text-torg-dark">Tarefas:</span>
              {detail.tarefasEnviadasEm ? (
                <span className="text-[11px] font-semibold text-green-700"
                  title="As tarefas deste cronograma aparecem na aba Sequência de cada setor">
                  enviadas em {new Date(detail.tarefasEnviadasEm).toLocaleDateString("pt-BR")}
                </span>
              ) : (
                <span className="text-[11px] text-torg-gray italic">não enviadas — os setores não veem</span>
              )}
              {!readOnly && (
                <button
                  onClick={() => enviarTarefas(!!detail.tarefasEnviadasEm)}
                  disabled={enviandoTarefas}
                  title={detail.tarefasEnviadasEm
                    ? "Recolher: as tarefas somem da Sequência dos setores"
                    : "Enviar as tarefas pros setores — elas passam a aparecer na aba Sequência"}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded border disabled:opacity-50 ${
                    detail.tarefasEnviadasEm
                      ? "text-torg-gray bg-gray-50 border-gray-200 hover:bg-gray-100"
                      : "text-white bg-torg-blue border-torg-blue hover:bg-torg-blue/90"
                  }`}
                >
                  {enviandoTarefas ? "..." : detail.tarefasEnviadasEm ? "Recolher" : "Enviar tarefas"}
                </button>
              )}
            </div>
            {/* Toggle DU / DC */}
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-200">
              <Calendar size={12} className="text-torg-gray" />
              {!readOnly ? (
                <div className="flex rounded-md overflow-hidden border border-gray-200">
                  <button
                    onClick={() => alterarTipoDias("DU")}
                    disabled={savingTipoDias || (detail.tipoDias || "DU") === "DU"}
                    className={`px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      (detail.tipoDias || "DU") === "DU"
                        ? "bg-torg-blue text-white"
                        : "bg-white text-torg-gray hover:bg-gray-50"
                    } disabled:opacity-70`}
                    title="Dias Úteis (seg-sex)"
                  >
                    DU
                  </button>
                  <button
                    onClick={() => alterarTipoDias("DC")}
                    disabled={savingTipoDias || detail.tipoDias === "DC"}
                    className={`px-2 py-0.5 text-[10px] font-semibold transition-colors border-l border-gray-200 ${
                      detail.tipoDias === "DC"
                        ? "bg-torg-blue text-white"
                        : "bg-white text-torg-gray hover:bg-gray-50"
                    } disabled:opacity-70`}
                    title="Dias Corridos (todos os dias)"
                  >
                    DC
                  </button>
                </div>
              ) : (
                <span className="text-[10px] font-semibold text-torg-blue bg-torg-blue-50 px-2 py-0.5 rounded">
                  {(detail.tipoDias || "DU") === "DU" ? "DU" : "DC"}
                </span>
              )}
              <span className="text-[9px] text-torg-gray">
                {(detail.tipoDias || "DU") === "DU" ? "Dias Úteis" : "Dias Corridos"}
              </span>
            </div>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open(`/api/planejamento/cronogramas/${cronogramaId}/pdf`, "_blank")}
                className="px-3 py-1 text-[10px] font-medium text-white bg-torg-blue rounded-lg hover:bg-torg-blue-700 flex items-center gap-1.5"
                title="Gera o cronograma em PDF (visão de Gantt) para apresentar ou enviar ao cliente."
              >
                <FileDown size={12} /> Exportar Gantt (PDF)
              </button>
              <button
                onClick={() => setModalEnviar(true)}
                className="px-3 py-1 text-[10px] font-medium text-torg-blue bg-white border border-torg-blue rounded-lg hover:bg-torg-blue-50 flex items-center gap-1.5"
                title="Envia o cronograma em PDF por e-mail para o cliente e/ou para a equipe."
              >
                <Send size={12} /> Enviar ao cliente
              </button>
              <button
                onClick={encerrarCronograma}
                disabled={encerrando}
                className="px-3 py-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 flex items-center gap-1.5 disabled:opacity-50"
                title="Encerrar e mover para histórico"
              >
                {encerrando ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                Encerrar
              </button>
              <button
                onClick={excluirCronograma}
                disabled={deleting}
                className="px-3 py-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Excluir
              </button>
            </div>
          )}
        </div>
      )}

      {modalEnviar && (
        <ModalEnviarCronograma cronogramaId={cronogramaId} onClose={() => setModalEnviar(false)} />
      )}

      <div className="flex items-center justify-between border-b border-gray-100">
        <div className="flex">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-torg-blue text-torg-blue"
                    : "border-transparent text-torg-gray hover:text-torg-dark"
                }`}
              >
                <Icon size={13} /> {t.label}
                {t.key === "historico" && detail?.revisoes?.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-torg-gray text-[9px] rounded-full font-bold">{detail.revisoes.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "cronograma" && (
        loadingDetail ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-torg-blue" />
            <span className="ml-2 text-sm text-torg-gray">Carregando tarefas...</span>
          </div>
        ) : detail ? (
          <CronogramaDetail detail={detail} onRefresh={onRefreshDetail} cronogramaId={cronogramaId} readOnly={readOnly} />
        ) : (
          <div className="py-6 text-center text-sm text-torg-gray">Erro ao carregar detalhe.</div>
        )
      )}

      {tab === "producao" && (
        <ProducaoTab cronogramaId={cronogramaId} />
      )}

      {tab === "suprimentos" && (
        <SuprimentosTab cronogramaId={cronogramaId} />
      )}

      {tab === "historico" && detail && (
        <HistoricoTab revisoes={detail.revisoes || []} />
      )}
    </div>
  );
}
